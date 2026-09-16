# Steward — execution plan (rev 2: business, sandbox-only)

Hand-off document for whichever model/agents execute the build. Read
`CLAUDE.md`, `docs/direction.md`, `docs/landscape.md`, and
`docs/api-friction-log.md` first; this file is the *what to do*, those are the
*why*. Rev 1 (personal account, production reads) is superseded — see §9.

## 0. Decisions already made (do not relitigate)

| Decision | Choice |
|---|---|
| Concept | **Steward** — a propose-only agent tier on Mercury for a technical founder running **month-end close from the terminal**. Read → analyze → propose → approve (gate 1: in the client when it can render it) → approve in Mercury (gate 2: approval queue). The agent has no path to move money. |
| Persona | Founder/CFO of a small startup. The sandbox org *is* the company. |
| Workflow | (1) cash position across accounts, (2) AR: overdue invoices we sent → follow-ups, (3) AP: pay vendors from the recipient list → approval queue, (4) sweep operating surplus to treasury/savings → approval queue. |
| Environment | **Sandbox only.** `https://api-sandbox.mercury.com/api/v1` for every call. One sandbox token (read-write is fine in sandbox; there is no real money). No production tokens in the build. |
| Hosting | Vercel, one Next.js app. MCP at `/api/mcp/[secret]`, chat UI at `/`, approve page at `/approve/[token]`, docs at `/docs`. |
| Hero client | **Claude Code** — renders MCP elicitation (gate 1) and is the persona's actual tool. `claude mcp add --transport http steward https://<app>/api/mcp/<secret>`. |
| Other clients | Claude.ai, ChatGPT, Grok: connect for reads + proposals; approvals fall back to the **approve URL** (surface we own). Web chat (AI SDK): full flow. `mercury … \| steward` CLI pipe: audit only. |
| MCP auth | Long random path segment + server-side check. Real OAuth is a "what's next" slide. |
| Model | Claude via Vercel AI SDK, `claude-sonnet-5`. |
| Presentation | `docs/index.html` memo + `docs/explainer.html` walkthrough. Remotion render = stretch. |
| Standing task | **Keep cataloging.** Every paper cut goes in `docs/api-friction-log.md` under the right layer (API · MCP · CLI · docs · sandbox · ecosystem) with severity and a proposed fix. This is a deliverable, not a side effect. |

## Status (2026-09-15, end of day)

Built and green without a sandbox token:
- `packages/core`: sandbox-only Mercury client (refuses production, redacts account/routing numbers, follows cursors), analyzers (cash floor, overdue AR, bills-due AP with recipient matching, treasury sweep), zod proposal schema, `closeMonth()` / `queueProposal()`. **11/11 tests.**
- `apps/web`: MCP route with real MRTR elicitation + HMAC `requestState` + approve-URL fallback; chat UI on AI SDK 7; `/approve/[token]`; `/docs` served statically. **`next build` passes.**
- `npm run smoke` — offline end-to-end with a mock Mercury and the real MCP client SDK: `tools/list`, `close_month`, approve-URL fallback for clients without elicitation, and the full MRTR round trip (form → accept → signed re-entry → `POST /request-transfer` with the proposal id as idempotencyKey → `pendingApproval`; decline → nothing queued). 7/7 checks.

~~Blocked on the sandbox token~~ Token in hand (Custom, IPv4-allowlisted). **§2 read recon done 2026-09-16 → `docs/sandbox-surface.md`, friction #45–57.** Live read-only `closeMonth`: 0 follow-ups, 0 pays, 3 unmatched bills, 1 un-queueable sweep — seed data can't exercise AR/AP/treasury. **§2 writes 2026-09-16: `request-send-money` → 400 `invalidApproval` (one-member org can't self-approve, #58); `request-transfer` → 403 (no scope, #41). Gate 2 is blocked until the sandbox org has a second approver.** Still open: second approver, seeding, the `createdAt` fix in `closeMonth` (#47), Claude Code end-to-end. Requires Node ≥ 22 (`Object.groupBy`).

## 1. Preconditions (human)

- [ ] Sandbox account at https://sandbox.mercury.com/signup → sandbox API token (read-write, no allowlist needed? **verify** — if the sandbox modal also demands an IP allowlist for read-write, log it and use a Custom token with `RequestSendMoney` + reads).
- [ ] `.env.local` in repo root: `MERCURY_SANDBOX_API_TOKEN=secret-token:mercury_sandbox_…`, `ANTHROPIC_API_KEY`, `MCP_PATH_SECRET` (32+ random chars), `STATE_SECRET` (32+ random chars).
- [ ] Vercel project linked; same vars in Production + Preview; Deployment Protection **off** for the MCP route.

## 2. Step 1 — sandbox recon (30 min, blocking)

Sweep the sandbox and write `docs/sandbox-surface.md`: status, row counts, and a
redacted sample per endpoint. This is both our data-availability check and a
friction-log source (the docs don't enumerate what the sandbox seeds).

```
GET /accounts                 # kinds present? checking/savings/treasury/credit? balances?
GET /transactions?limit=200   # merchant.categoryCode? mercuryCategory? counterpartyName? kinds?
GET /recipients               # how many vendors seeded? payment methods?
GET /invoices  GET /customers # AR seeded? statuses (unpaid/overdue)?
GET /treasury                 # exists in sandbox?
GET /credit
GET /categories  GET /merchants?limit=5
GET /organization  GET /users
GET /cards
GET /request-send-money       # approval-request list — does the concept exist here?
GET /events?limit=3           # events in sandbox? (webhooks are documented as unavailable)
```

Then the writes we depend on, each with a unique `idempotencyKey`, small amounts:
```
POST /account/{checkingId}/request-send-money      {recipientId, amount, paymentMethod:"ach", idempotencyKey}
POST /account/{checkingId}/request-transfer-money  {destinationAccountId, amount, idempotencyKey}   # treasury or savings
POST /invoices  (only if AR create works without IP allowlist in sandbox; else log it)
```
Confirm each 200s **and appears in the sandbox dashboard's approval queue**, then
approve one in the dashboard and confirm the resulting transaction shows in
`GET /transactions`. If the sandbox has no approval queue UI, that's a 🔴 finding
and gate 2 becomes "status polling on `GET /request-send-money/{id}`" for the demo.

If seed data is thin (few recipients, no invoices), seed it via API:
`POST /recipients` ×5 vendors, `POST /customers` ×3, `POST /invoices` ×4 (two overdue).
Record what had to be seeded — that's a friction entry ("sandbox needs a
realistic seed profile").

## 3. Repo layout

```
mercury-demo/
  PLAN.md  CLAUDE.md  .env.example
  docs/                          # static, served at /docs
    index.html explainer.html direction.md landscape.md api-friction-log.md sandbox-surface.md take-home-brief.md
  packages/core/                 # framework-free TS
    src/mercury/client.ts        # sandbox base URL, bearer auth, cursor pagination, redaction of accountNumber/routingNumber
    src/mercury/types.ts         # hand-typed from llms.txt fragments (no codegen — no single OpenAPI file exists; log it)
    src/analyze/cash.ts          # position by account kind; operating floor = max(60-day min balance, 2× monthly outflow)
    src/analyze/ar.ts            # invoices: unpaid, overdue (dueDate < today), days late, amount → follow-up proposals
    src/analyze/ap.ts            # recipients + a small "bills due" list (seeded JSON: vendor→amount→due) → pay proposals
    src/analyze/sweep.ts         # surplus = available − floor − AP due → sweep proposal to treasury (or savings if no treasury)
    src/intents.ts               # zod: Proposal = followup | pay | sweep ; {why, evidence[], amount, requires_approval, reversible}
    src/steward.ts               # closeMonth(): runs all analyzers → proposals[] ; propose*() → sandbox request-* calls
  apps/web/                      # Next.js App Router, Node runtime
    app/api/mcp/[secret]/route.ts
    app/api/chat/route.ts
    app/approve/[token]/page.tsx # fallback gate 1 for clients without elicitation
    app/page.tsx                 # chat + proposal cards
  apps/cli/                      # optional: `steward close` reading jsonl from stdin
```

pnpm workspaces, TypeScript strict, no DB. Approval state lives in Mercury.

## 4. Work packages (parallelizable)

### A. `core`
- Client + types as above. `listAll*` helpers follow `page.nextPage`.
- `cash.ts`: group `GET /accounts` by `kind`; sum available; compute floor.
- `ar.ts`: `GET /invoices` → filter unpaid; overdue if `dueDate < now`; proposal `followup {customer, invoiceId, amount, daysLate}` (`requires_approval:false` — it's a message draft, no API for reminders; log that).
- `ap.ts`: bills-due list is a seeded JSON in `src/catalog/bills.json` mapping recipient names → amount/due (Mercury has no Bill Pay API — log it). Proposal `pay {recipientId, amount, memo, due}`.
- `sweep.ts`: surplus after AP; target = treasury account if present else savings; proposal `sweep {from, to, amount, why}`.
- Acceptance: unit tests on fixtures from `docs/sandbox-surface.md`; `closeMonth()` < 2 s.

### B. MCP route
- `mcp-handler@^2` + `@modelcontextprotocol/server@^2` + `zod@^4`, Node 20+, protocol 2026-07-28, `maxDuration = 60`. Not the v1 `@modelcontextprotocol/sdk`.
- Tools: `cash_position()`, `close_month({asOf?})` → proposals, `propose_payment({recipientId, amount, memo})`, `propose_sweep({fromAccountId, toAccountId, amount})`.
- **Gate 1 — MRTR elicitation.** First call returns `inputRequired({ inputRequests: { approve: inputRequired.elicit({ type:"form", fields:[{name:"approve", type:"boolean", required:true, label:"Queue $X to <vendor> for approval in Mercury?"}] }) }, requestState: await codec.mint({...}) })`; on re-entry read `acceptedContent(ctx.mcpReq.inputResponses, "approve")`; if true → sandbox `request-*` call; else declined. **Always include `inputRequests`** (state-only results break Claude.ai, anthropics/claude-ai-mcp#1027).
- **Capability fallback.** If `ctx.mcpReq.envelope?.clientCapabilities?.elicitation` is absent → return the proposal with `approve_url: https://<app>/approve/<signed token>` and instructions. Never execute, never fake a confirm via a second tool.
- Acceptance: Inspector lists 4 tools; Claude Code shows Approve/Decline on `propose_payment`; sandbox dashboard shows the queued payment; Claude.ai gets the approve link and it works.

### C. Web chat + approve page
- AI SDK `useChat`/`streamText`, tools imported from `core`. Proposal cards with Approve/Decline for `requires_approval` items → same sandbox `request-*` call → "queued in Mercury" state with dashboard link.
- `/approve/[token]`: verify signed token, render one proposal, Approve → queue. This is the fallback gate for Claude.ai/ChatGPT/Grok.
- Visual language from `docs/index.html` tokens.

### D. Docs + friction log (continuous)
- `docs/sandbox-surface.md` from §2.
- Append to `docs/api-friction-log.md` as you go, tagged by layer: `[api]` `[mcp]` `[cli]` `[docs]` `[sandbox]` `[ecosystem]`.
- Update `docs/index.html` findings ledger with the top new items at the end.

### E. CLI pipe (optional)
`mercury accounts list --format jsonl` + `mercury transactions list --format jsonl` piped into `steward close --json`. Note whether the official CLI honors `--base-url https://api-sandbox.mercury.com/api/v1` with a sandbox token (it has no `--sandbox` flag — log it).

## 5. Demo script (6–8 min, in Claude Code)

1. `docs/index.html` — 60 s: thesis, serverless/IP finding, client matrix.
2. Claude Code, Steward connected: "Run month-end close." → cash position, overdue invoices, bills due, surplus.
3. "Pay the two bills that are due this week." → Approve/Decline form (gate 1) → "queued in Mercury."
4. Sandbox dashboard → pending payments with Steward's note (gate 2) → approve one.
5. "Sweep the surplus to treasury." → same two gates.
6. 30 s: same conversation in Claude.ai → approve link → our page. Shows the client gap honestly.
7. `docs/explainer.html` wrap: what Mercury's MCP does today vs. this tier; the API/MCP/CLI changes we'd ask for.

## 6. Guardrails

- Sandbox only. If any code path can reach `api.mercury.com`, that's a bug.
- Never call `POST /account/{id}/transactions` (direct send) or `POST /transfer` (direct internal transfer). Only `request-*`.
- Never log/return `accountNumber`, `routingNumber`, card data.
- Proposals say "you could," not "you should."

## 7. Client matrix (verified 2026-09-15)

| Client | MCP | Elicitation (gate 1) | Role in demo |
|---|---|---|---|
| Claude Code | ✓ | ✓ form | **Hero** |
| Cursor / VS Code | ✓ | ✓ form | Alternate |
| Vercel AI SDK (`@ai-sdk/mcp`) | ✓ | ✓ form | Our web UI |
| Claude.ai | ✓ | ✗ (#153 open since Apr; state-only results error, #1027) | Reads + approve-URL |
| ChatGPT Dev Mode | ✓ | no evidence | Reads + approve-URL |
| Grok (grok.com connectors) | ✓ tools only | ✗ — elicitation times out (`emrgim/marriott-mcp#16`) | Reads + approve-URL |

Spec note: MCP 2026-07-28 made elicitation stateless (MRTR); sampling/roots deprecated. Don't use them.

## 8. Still open (need sandbox)

- ~~What the sandbox seeds~~ → `docs/sandbox-surface.md`: 9 depository + 1 credit account, 150 txns, 79 recipients (not vendor-like), 0 invoices/customers/treasury/statements, no categories or MCCs applied.
- Whether the sandbox has an approval-queue UI and whether `request-*` requests appear there.
- ~~Whether sandbox read-write tokens demand an IP allowlist~~ → yes, and so does the approval scope (#38, #39); allowlist is effectively IPv4-only (#44).
- Whether the official CLI works against the sandbox via `--base-url`.

## 9. Why rev 2 replaced rev 1

Rev 1 audited a personal account on production reads and queued writes to the
sandbox. Problems: the brief targets business customers; personal accounts may
lack approval-queue endpoints; splitting reads (prod) and writes (sandbox) made
the demo incoherent; consumer chat clients can't render approvals, so the
"approve in ChatGPT" moment wasn't real. Rev 2 puts the whole loop in one
business sandbox org with Claude Code as the hero — the persona Mercury itself
cites for its CLI. The personal token is an optional epilogue if time allows.
