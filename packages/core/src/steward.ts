import { MercuryApiError, type MercuryProposer, type MercuryReader } from "./mercury/client";
import { billsDue, type Bill } from "./analyze/ap";
import { overdueInvoices } from "./analyze/ar";
import { computeCashPosition, type FloorOptions } from "./analyze/cash";
import { sweepSurplus } from "./analyze/sweep";
import { CloseReport, type NotQueuedResult, type PayProposal, type Proposal, type QueueOutcome, type QueuedResult, type SweepProposal } from "./intents";
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
    mercury.listTransactions({ postedStart: start }),
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
 *
 * Mercury's refusals come back as a NotQueuedResult with a plain-language
 * remedy instead of a thrown API error: the human has just said yes, so they
 * need to know exactly why nothing happened and what would fix it.
 */
export async function queueProposal(mercury: MercuryProposer & { environment: QueuedResult["environment"] }, proposal: PayProposal | SweepProposal): Promise<QueueOutcome> {
  try {
    if (proposal.kind === "pay") {
      const r = await mercury.requestSendMoney(proposal.fromAccountId, {
        recipientId: proposal.recipientId,
        amount: proposal.amount,
        paymentMethod: proposal.paymentMethod,
        idempotencyKey: proposal.id,
        note: `Steward: ${proposal.memo}`,
      });
      return queued(mercury.environment, proposal, r.requestId, r.status);
    }
    const r = await mercury.requestTransferMoney({
      sourceAccountId: proposal.fromAccountId,
      destinationAccountId: proposal.toAccountId,
      amount: proposal.amount,
      idempotencyKey: proposal.id,
      note: "Steward: operating surplus sweep",
    });
    return queued(mercury.environment, proposal, r.requestId, r.status);
  } catch (err) {
    if (!(err instanceof MercuryApiError)) throw err;
    if (proposal.kind === "pay" && isAlreadyUsedKey(err)) {
      // Mercury rejects a replayed idempotency key instead of returning the original (friction log #59).
      const existing = (await safe(() => mercury.listSendMoneyApprovalRequests(), [])).find(
        (r) => r.accountId === proposal.fromAccountId && r.recipientId === proposal.recipientId && r.amount === proposal.amount,
      );
      if (existing) return queued(mercury.environment, proposal, existing.requestId, existing.status);
    }
    return explainRefusal(proposal, err);
  }
}

/** Mercury's dashboard approvals page. Verified for the sandbox; production host not verified. */
function approvalsUrl(environment: QueuedResult["environment"], requestId?: string): string | null {
  if (environment !== "sandbox") return null;
  return `https://sandbox.mercury.com/payments/approvals${requestId ? `?requestId=${requestId}` : ""}`;
}

function queued(environment: QueuedResult["environment"], proposal: PayProposal | SweepProposal, requestId: string, status: QueuedResult["status"]): QueuedResult {
  const what =
    proposal.kind === "pay"
      ? `the ${proposal.paymentMethod.toUpperCase()} to ${proposal.recipientName}`
      : `the transfer ${proposal.fromName} → ${proposal.toName}`;
  const done = status !== "pendingApproval";
  return {
    proposalId: proposal.id,
    mercuryRequestId: requestId,
    status,
    environment,
    next: done
      ? `Mercury already has this request (${status}). Nothing new was queued.`
      : `Another approver in your org approves ${what} in Mercury → Payments → Needs Approval. Nothing has moved yet.`,
    approveUrl: approvalsUrl(environment, proposal.kind === "pay" ? requestId : undefined),
  };
}

function isAlreadyUsedKey(err: MercuryApiError): boolean {
  return err.status === 400 && /already used this idempotency key/i.test(err.body);
}

function explainRefusal(proposal: PayProposal | SweepProposal, err: MercuryApiError): NotQueuedResult {
  const base = { proposalId: proposal.id, notQueued: true as const, mercuryStatus: err.status };
  const body = err.body;
  if (/invalidApproval/.test(body)) {
    return {
      ...base,
      reason: "needs_second_approver",
      message: "Mercury didn't queue this: nobody else in your organization can approve it, and Mercury doesn't let the requester approve their own request.",
      remedy: "Add a teammate who can approve payments (Mercury → Settings → Team), then ask again. Nothing was created.",
    };
  }
  if (/tokenNotInScope/.test(body)) {
    return {
      ...base,
      reason: "missing_scope",
      message:
        proposal.kind === "sweep"
          ? "Mercury didn't queue this transfer: this API token can't request transfers. Mercury's token scopes include \"Send Money with Approval\" but nothing for transfers."
          : "Mercury didn't queue this: the API token is missing the scope for this request.",
      remedy:
        proposal.kind === "sweep"
          ? `Make the transfer yourself in Mercury → Transfer: ${proposal.fromName} → ${proposal.toName}, $${proposal.amount.toLocaleString("en-US")}. Nothing was created.`
          : "Create a token with \"Send Money with Approval\" in Mercury → Settings → API Tokens. Nothing was created.",
    };
  }
  if (isAlreadyUsedKey(err)) {
    return {
      ...base,
      reason: "already_used_key",
      message: "Mercury says this exact proposal was already submitted today, but the original request couldn't be found.",
      remedy: "Check Mercury → Payments → Needs Approval before asking again, so it isn't queued twice.",
    };
  }
  return {
    ...base,
    reason: "mercury_error",
    message: `Mercury didn't queue this (HTTP ${err.status}).`,
    remedy: `Nothing was created. Mercury said: ${body.slice(0, 200)}`,
  };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
