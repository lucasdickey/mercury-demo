import type { Account, TreasuryAccount } from "../mercury/types";
import type { CashPosition, PayProposal, SweepProposal } from "../intents";
import { fmt } from "./ar";
import { round2 } from "./cash";
import { stableId } from "./id";

export interface SweepOptions {
  /** Don't propose sweeps smaller than this. Default 1,000. */
  minimum?: number;
  /** Round the sweep down to a multiple of this. Default 100. */
  granularity?: number;
}

/**
 * Surplus = operating available − floor − payments we're about to queue.
 * Destination: a treasury account if one exists, else the largest savings account.
 * Uses `request-transfer` (approval queue), never `POST /transfer`.
 */
export function sweepSurplus(
  position: CashPosition,
  accounts: Account[],
  treasury: TreasuryAccount[],
  pendingPayments: PayProposal[],
  asOf: Date,
  opts: SweepOptions = {},
): SweepProposal | null {
  if (!position.operating) return null;
  const minimum = opts.minimum ?? 1_000;
  const granularity = opts.granularity ?? 100;
  const committed = pendingPayments.reduce((s, p) => s + p.amount, 0);
  const raw = position.operating.available - position.floor - committed;
  const amount = Math.floor(raw / granularity) * granularity;
  if (amount < minimum) return null;

  const dest = pickDestination(accounts, treasury);
  if (!dest) return null;

  return {
    kind: "sweep",
    id: stableId("sweep", position.operating.accountId + dest.id + amount, asOf),
    why: `${fmt(round2(raw))} sits above the ${fmt(position.floor)} operating floor after ${fmt(committed)} of queued payments; ${dest.kind} earns yield, checking doesn't.`,
    evidence: [position.operating.accountId, dest.id],
    requires_approval: true,
    reversible: true,
    fromAccountId: position.operating.accountId,
    fromName: position.operating.name,
    toAccountId: dest.id,
    toName: dest.name,
    toKind: dest.kind,
    amount,
  };
}

function pickDestination(accounts: Account[], treasury: TreasuryAccount[]): { id: string; name: string; kind: string } | null {
  const t = treasury.find((x) => x.status === "active");
  if (t) return { id: t.id, name: "Treasury", kind: "treasury" };
  const savings = accounts
    .filter((a) => a.status === "active" && a.type === "mercury" && a.kind.toLowerCase() === "savings")
    .sort((a, b) => b.availableBalance - a.availableBalance)[0];
  if (savings) return { id: savings.id, name: savings.nickname ?? savings.name, kind: "savings" };
  return null;
}
