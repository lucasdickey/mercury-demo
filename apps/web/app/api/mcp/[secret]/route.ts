import { createMcpHandler } from "mcp-handler";
import { acceptedContent, createRequestStateCodec, inputRequired, type McpServer, type ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import { closeMonth, queueProposal, refusalFor, PayProposal, SweepProposal, type NotQueuedResult, type Proposal, type StickyRefusal } from "@steward/core";
import { mercury, requireEnv } from "@/lib/mercury";
import { loadBills } from "@/lib/bills";
import { approveUrl } from "@/lib/approve-token";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Steward MCP server. Protocol 2026-07-28 over stateless Streamable HTTP.
 *
 * Gate 1 (approve in the client) is MRTR elicitation: `propose_*` returns
 * `input_required`; the client renders Approve/Decline and retries the same
 * call with `inputResponses` + our HMAC-signed `requestState`. Clients that
 * don't declare the elicitation capability get an approve URL instead — we
 * never execute without a human, and never fake a confirmation via a second tool.
 *
 * Gate 2 is Mercury's own approval queue: the only writes are request-* calls.
 */

type PendingState = { proposal: Proposal };
let _codec: ReturnType<typeof createRequestStateCodec<PendingState>> | null = null;
const codec = () => (_codec ??= createRequestStateCodec<PendingState>({ key: requireEnv("STATE_SECRET", 32), ttlSeconds: 600 }));

/**
 * An explicit choice, not a checkbox: a boolean renders as a tick box that starts
 * unset, and Accept on an unset required field fails validation with no feedback.
 */
const Approve = z.object({
  approve: z.enum(["queue it", "cancel"]).describe("Queue this in Mercury's approval queue, or cancel?"),
});

/**
 * Mercury has no way to ask "would you accept this request?" before creating it
 * (friction log #58), so the first refusal is only learned after the human says yes.
 * Remember refusals that won't fix themselves, per proposal kind, and don't ask again.
 * Only the reason is remembered; the explanation is rebuilt for the proposal at hand,
 * since its remedy names accounts and an amount.
 */
const REFUSAL_TTL_MS = 10 * 60_000;
const refusals = new Map<Proposal["kind"], { reason: StickyRefusal; mercuryStatus: number; at: number }>();
function knownRefusal(proposal: PayProposal | SweepProposal): NotQueuedResult | null {
  const hit = refusals.get(proposal.kind);
  return hit && Date.now() - hit.at < REFUSAL_TTL_MS ? refusalFor(proposal, hit.reason, hit.mercuryStatus) : null;
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "cash_position",
      {
        title: "Cash position",
        description:
          "Balances by account kind, the operating account, the operating floor (2× average monthly outflow), and average monthly outflow. Read-only.",
        inputSchema: z.object({ floor: z.number().optional().describe("Override the operating floor in dollars") }),
      },
      async ({ floor }) => {
        const report = await closeMonth(mercury(), { floor });
        return json(report.position);
      },
    );

    server.registerTool(
      "close_month",
      {
        title: "Run month-end close",
        description:
          "Reads accounts, transactions, invoices, recipients, and treasury from Mercury and returns proposals: overdue-invoice follow-ups (drafts), bills due this week (payments), and a treasury sweep of the surplus. Read-only — nothing is queued or sent. Use propose_payment / propose_sweep to act on a proposal.",
        inputSchema: z.object({
          withinDays: z.number().int().min(0).max(60).optional().describe("Include bills due within this many days (default 7)"),
          floor: z.number().optional().describe("Override the operating floor in dollars"),
        }),
      },
      async ({ withinDays, floor }) => {
        const report = await closeMonth(mercury(), { withinDays, floor, bills: loadBills() });
        return json(report);
      },
    );

    server.registerTool(
      "propose_payment",
      {
        title: "Propose a vendor payment",
        description:
          "Queues an ACH payment to a saved recipient for approval in Mercury's dashboard. Asks you to confirm first (or gives you an approve link if your client can't show a confirmation). Never sends money directly.",
        inputSchema: z.object({
          fromAccountId: z.string(),
          recipientId: z.string(),
          recipientName: z.string(),
          amount: z.number().positive(),
          memo: z.string().max(140),
          due: z.string().describe("YYYY-MM-DD"),
        }),
      },
      async (args, ctx) => {
        const proposal: Proposal = PayProposal.parse({
          kind: "pay",
          id: `steward-pay-${new Date().toISOString().slice(0, 10)}-${hash(args.recipientId + args.amount + args.due)}`,
          why: `Requested in chat: ${args.memo}`,
          evidence: [args.recipientId],
          requires_approval: true,
          reversible: false,
          paymentMethod: "ach",
          ...args,
        });
        return gate(server, ctx, proposal, `Queue $${args.amount.toLocaleString()} ACH to ${args.recipientName} for approval in Mercury? (${args.memo})`);
      },
    );

    server.registerTool(
      "propose_sweep",
      {
        title: "Propose a surplus sweep",
        description:
          "Queues an internal transfer (e.g. checking → treasury) for approval in Mercury's dashboard. Asks you to confirm first (or gives you an approve link). Never transfers directly.",
        inputSchema: z.object({
          fromAccountId: z.string(),
          fromName: z.string(),
          toAccountId: z.string(),
          toName: z.string(),
          toKind: z.string().describe("treasury | savings"),
          amount: z.number().positive(),
        }),
      },
      async (args, ctx) => {
        const proposal: Proposal = SweepProposal.parse({
          kind: "sweep",
          id: `steward-sweep-${new Date().toISOString().slice(0, 10)}-${hash(args.fromAccountId + args.toAccountId + args.amount)}`,
          why: "Requested in chat",
          evidence: [args.fromAccountId, args.toAccountId],
          requires_approval: true,
          reversible: true,
          ...args,
        });
        return gate(server, ctx, proposal, `Queue a $${args.amount.toLocaleString()} transfer ${args.fromName} → ${args.toName} for approval in Mercury?`);
      },
    );
  },
  {
    serverInfo: { name: "steward", version: "0.1.0" },
    requestState: { verify: (state, ctx) => codec().verify(state, ctx) },
  },
);

/** The approval gate shared by both propose_* tools. */
async function gate(server: McpServer, ctx: ServerContext, proposal: PayProposal | SweepProposal, message: string) {
  // Re-entry: the client answered our elicitation and echoed the signed state.
  const state = ctx.mcpReq.requestState<PendingState>();
  if (state) {
    const answer = acceptedContent(ctx.mcpReq.inputResponses, "approve", Approve);
    if (answer?.approve !== "queue it") return text(`Declined. Nothing was queued for ${describe(state.proposal)}.`);
    const outcome = await queueProposal(mercury(), state.proposal as PayProposal | SweepProposal);
    if ("notQueued" in outcome) {
      if (outcome.reason === "needs_second_approver" || outcome.reason === "missing_scope") {
        refusals.set(state.proposal.kind, { reason: outcome.reason, mercuryStatus: outcome.mercuryStatus, at: Date.now() });
      }
      return refused(outcome);
    }
    refusals.delete(state.proposal.kind);
    return json({ queued: outcome, gate2: outcome.next, approve_in_mercury: outcome.approveUrl });
  }

  const known = knownRefusal(proposal);
  if (known) return refused({ ...known, message: `Not asking you to approve: ${known.message}` });

  // First call: can this client render a form?
  if (!clientSupportsElicitation(server, ctx)) {
    return json({
      status: "needs_human_approval",
      proposal,
      approve_url: approveUrl(proposal),
      instructions: "This client can't show an approval prompt. Give the user the approve_url; the payment is queued in Mercury only after they approve there. Do not call this tool again to confirm.",
    });
  }

  return inputRequired({
    inputRequests: { approve: inputRequired.elicit({ message, requestedSchema: Approve }) },
    requestState: await codec().mint({ proposal }, ctx),
  });
}

/**
 * 2026-07-28 clients declare capabilities per request (`_meta["io.modelcontextprotocol/clientCapabilities"]`);
 * the SDK backfills `getClientCapabilities()` from that envelope. 2025-era clients declare at initialize.
 * Claude Code / Cursor / VS Code declare `elicitation`; Claude.ai, ChatGPT, Grok don't (PLAN.md §7).
 */
function clientSupportsElicitation(server: McpServer, ctx: ServerContext): boolean {
  const declared = server.server.getClientCapabilities();
  if (process.env.STEWARD_DEBUG) console.error("[steward] caps", JSON.stringify({ declared, envelope: ctx.mcpReq.envelope, meta: ctx.mcpReq._meta }));
  if (declared) return declared.elicitation !== undefined;
  const env = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const caps = (env?.clientCapabilities ?? env?.["io.modelcontextprotocol/clientCapabilities"]) as { elicitation?: unknown } | undefined;
  return caps?.elicitation !== undefined;
}

function describe(p: Proposal): string {
  if (p.kind === "pay") return `${p.recipientName} $${p.amount}`;
  if (p.kind === "sweep") return `${p.fromName} → ${p.toName} $${p.amount}`;
  return p.kind;
}
function hash(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0");
}
/** Not an MCP tool error: the call worked, Mercury declined. The model should relay the remedy verbatim. */
function refused(r: NotQueuedResult) {
  return { content: [{ type: "text" as const, text: `${r.message}\n${r.remedy}` }], structuredContent: r as unknown as Record<string, unknown> };
}
function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}
function json(v: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }], structuredContent: v as Record<string, unknown> };
}

/** Path-secret check: the only auth on this demo endpoint (PLAN.md §0). */
function guarded(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  return ctx.params.then(async ({ secret }) => {
    if (secret !== requireEnv("MCP_PATH_SECRET", 16)) return new Response("Not found", { status: 404 });
    if (process.env.STEWARD_DEBUG) await logCall(req);
    return handler(req);
  });
}

/** STEWARD_DEBUG: name each call in the dev log, so a slow request can be traced to its method or tool. */
async function logCall(req: Request) {
  if (req.method !== "POST") return console.error(`[steward] ${req.method}`);
  try {
    const msg = await req.clone().json();
    for (const m of Array.isArray(msg) ? msg : [msg]) console.error(`[steward] ${new Date().toISOString()} ${m.method ?? "response"}${m.params?.name ? ` ${m.params.name}` : ""}`);
  } catch {
    console.error("[steward] POST (unparsed body)");
  }
}
export { guarded as GET, guarded as POST, guarded as DELETE };
