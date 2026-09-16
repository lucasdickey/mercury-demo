import { z } from "zod";

/**
 * A Proposal is the only thing Steward ever produces. Proposals with
 * `requires_approval: true` are queued in Mercury via the request-* endpoints
 * after a human says yes; they are never executed directly.
 */

const base = {
  id: z.string().describe("Deterministic id; doubles as the Mercury idempotencyKey"),
  why: z.string().describe("One sentence a founder would accept as the reason"),
  evidence: z.array(z.string()).describe("Mercury object ids that justify the proposal"),
  requires_approval: z.boolean(),
  reversible: z.boolean(),
};

export const FollowupProposal = z.object({
  kind: z.literal("followup"),
  ...base,
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  customerId: z.string(),
  customerName: z.string().optional(),
  amount: z.number(),
  dueDate: z.string(),
  daysLate: z.number().int(),
  draft: z.string().describe("Reminder text the founder can send; Mercury has no reminder API"),
});

export const PayProposal = z.object({
  kind: z.literal("pay"),
  ...base,
  fromAccountId: z.string(),
  recipientId: z.string(),
  recipientName: z.string(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["ach", "check", "domesticWire", "internationalWire", "realTimePayment"]),
  due: z.string(),
  memo: z.string(),
});

export const SweepProposal = z.object({
  kind: z.literal("sweep"),
  ...base,
  fromAccountId: z.string(),
  fromName: z.string(),
  toAccountId: z.string(),
  toName: z.string(),
  toKind: z.string(),
  amount: z.number().positive(),
});

export const UnmatchedBill = z.object({
  kind: z.literal("unmatched_bill"),
  ...base,
  vendor: z.string(),
  amount: z.number(),
  due: z.string(),
});

export const Proposal = z.discriminatedUnion("kind", [FollowupProposal, PayProposal, SweepProposal, UnmatchedBill]);
export type Proposal = z.infer<typeof Proposal>;
export type FollowupProposal = z.infer<typeof FollowupProposal>;
export type PayProposal = z.infer<typeof PayProposal>;
export type SweepProposal = z.infer<typeof SweepProposal>;

export const CashPosition = z.object({
  asOf: z.string(),
  byKind: z.record(z.string(), z.number()).describe("Totals across every active account of each kind, not single accounts"),
  accounts: z
    .array(z.object({ accountId: z.string(), name: z.string(), kind: z.string(), available: z.number() }))
    .describe("Each active account; name individual accounts only from here"),
  operating: z.object({ accountId: z.string(), name: z.string(), available: z.number() }).nullable(),
  totalAvailable: z.number(),
  floor: z.number(),
  floorBasis: z.string(),
  avgMonthlyOutflow: z.number(),
});
export type CashPosition = z.infer<typeof CashPosition>;

export const CloseReport = z.object({
  position: CashPosition,
  proposals: z.array(Proposal),
  notes: z.array(z.string()).describe("Things the founder should know that aren't proposals"),
});
export type CloseReport = z.infer<typeof CloseReport>;

/** Queued-in-Mercury outcome after a human approved a proposal. */
export const QueuedResult = z.object({
  proposalId: z.string(),
  mercuryRequestId: z.string(),
  status: z.enum(["pendingApproval", "approved", "rejected", "cancelled"]),
  environment: z.enum(["sandbox", "production", "custom"]),
  next: z.string().describe("What the human does now"),
  approveUrl: z.string().nullable().describe("Where to approve it in Mercury's dashboard, when known"),
});
export type QueuedResult = z.infer<typeof QueuedResult>;

/** Mercury refused to queue it. Nothing was created; `remedy` says what would fix it. */
export const NotQueuedResult = z.object({
  proposalId: z.string(),
  notQueued: z.literal(true),
  reason: z.enum(["needs_second_approver", "missing_scope", "already_used_key", "mercury_error"]),
  message: z.string(),
  remedy: z.string(),
  mercuryStatus: z.number().int(),
});
export type NotQueuedResult = z.infer<typeof NotQueuedResult>;
export type QueueOutcome = QueuedResult | NotQueuedResult;
