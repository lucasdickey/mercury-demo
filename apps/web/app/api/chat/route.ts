import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { closeMonth } from "@steward/core";
import { mercury } from "@/lib/mercury";
import { loadBills } from "@/lib/bills";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The surface we own. Same engine as the MCP route; gate 1 here is the
 * Approve button on a proposal card (app/page.tsx → queue action), so the
 * model only gets read tools plus a "propose" that returns the card.
 */
export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic(process.env.STEWARD_MODEL ?? "claude-sonnet-5"),
    system: [
      "You are Steward, a month-end close assistant for a small company that banks with Mercury.",
      "You can read the books and draft proposals. You cannot move money: payments and transfers are queued for a human to approve in Mercury, and only after they press Approve on the card.",
      "Be concrete and brief. Cite amounts and dates. Say 'you could', not 'you should'. Never give tax or investment advice.",
      "When the user asks to close the month, call close_month once and summarize: cash position, overdue receivables, bills due, and the sweep. Offer the approvals; don't nag.",
      "close_month only reads. Its proposals are suggestions: nothing is queued, sent, or pending in Mercury until the user presses Approve on a card below your message. Never say a proposal is queued or awaiting approval in Mercury.",
      "position.byKind values are totals across all accounts of that kind. Name an individual account only from position.accounts, with its own balance.",
    ].join(" "),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(4),
    tools: {
      close_month: tool({
        description: "Run month-end close: cash position, overdue invoices, bills due, surplus sweep. Read-only.",
        inputSchema: z.object({ withinDays: z.number().int().optional(), floor: z.number().optional() }),
        execute: async ({ withinDays, floor }) => closeMonth(mercury(), { withinDays, floor, bills: loadBills() }),
      }),
      cash_position: tool({
        description: "Balances by kind, operating floor, average monthly outflow. Read-only.",
        inputSchema: z.object({ floor: z.number().optional() }),
        execute: async ({ floor }) => (await closeMonth(mercury(), { floor })).position,
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
