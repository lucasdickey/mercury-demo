import type { MercuryProposer, MercuryReader } from "./mercury/client";
import { billsDue, type Bill } from "./analyze/ap";
import { overdueInvoices } from "./analyze/ar";
import { computeCashPosition, type FloorOptions } from "./analyze/cash";
import { sweepSurplus } from "./analyze/sweep";
import { CloseReport, type PayProposal, type Proposal, type QueuedResult, type SweepProposal } from "./intents";
import defaultBills from "./catalog/bills.json" with { type: "json" };

export interface CloseOptions extends FloorOptions {
  asOf?: Date;
  bills?: Bill[];
  /** Days ahead to include bills. Default 7. */
  withinDays?: number;
}

/**
 * Month-end close: read → analyze → proposals. Pure with respect to Mercury:
 * this function only reads. Nothing here can move money.
 */
export async function closeMonth(mercury: MercuryReader, opts: CloseOptions = {}): Promise<CloseReport> {
  const asOf = opts.asOf ?? new Date();
  const start = new Date(asOf.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);

  const [accounts, transactions, recipients, invoices, customers, treasury] = await Promise.all([
    mercury.listAccounts(),
    mercury.listTransactions({ start }),
    mercury.listRecipients(),
    safe(() => mercury.listInvoices(), []),
    safe(() => mercury.listCustomers(), []),
    safe(() => mercury.listTreasury(), []),
  ]);

  const notes: string[] = [];
  const position = computeCashPosition(accounts, transactions, asOf, opts);
  if (!position.operating) notes.push("No active checking account found; skipped payables and sweep.");

  const proposals: Proposal[] = [];
  proposals.push(...overdueInvoices(invoices, customers, asOf));
  if (invoices.length === 0) notes.push("No invoices returned; either none are seeded or the AR endpoints aren't available here.");

  if (position.operating) {
    const ap = billsDue(opts.bills ?? (defaultBills as Bill[]), recipients, position.operating.accountId, asOf, { withinDays: opts.withinDays });
    proposals.push(...ap);
    const pays = ap.filter((p): p is PayProposal => p.kind === "pay");
    const sweep = sweepSurplus(position, accounts, treasury, pays, asOf);
    if (sweep) proposals.push(sweep);
    else notes.push(`Nothing to sweep: operating balance is within ${position.floorBasis} plus queued payments.`);
  }

  return CloseReport.parse({ position, proposals, notes });
}

/**
 * The only write path. Called after a human approved a proposal (gate 1).
 * Uses request-* endpoints exclusively, so Mercury's approval queue (gate 2)
 * still stands between this call and any money moving.
 */
export async function queueProposal(mercury: MercuryProposer & { environment: QueuedResult["environment"] }, proposal: PayProposal | SweepProposal): Promise<QueuedResult> {
  if (proposal.kind === "pay") {
    const r = await mercury.requestSendMoney(proposal.fromAccountId, {
      recipientId: proposal.recipientId,
      amount: proposal.amount,
      paymentMethod: proposal.paymentMethod,
      idempotencyKey: proposal.id,
      note: `Steward: ${proposal.memo}`,
    });
    return {
      proposalId: proposal.id,
      mercuryRequestId: r.requestId,
      status: r.status,
      environment: mercury.environment,
      next: `Open Mercury → Approvals and approve the ${proposal.paymentMethod.toUpperCase()} to ${proposal.recipientName}. Nothing has moved yet.`,
    };
  }
  const r = await mercury.requestTransferMoney({
    sourceAccountId: proposal.fromAccountId,
    destinationAccountId: proposal.toAccountId,
    amount: proposal.amount,
    idempotencyKey: proposal.id,
    note: "Steward: operating surplus sweep",
  });
  return {
    proposalId: proposal.id,
    mercuryRequestId: r.requestId,
    status: r.status,
    environment: mercury.environment,
    next: `Open Mercury → Approvals and approve the transfer ${proposal.fromName} → ${proposal.toName}. Nothing has moved yet.`,
  };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
