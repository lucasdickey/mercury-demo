import type { Account, Transaction } from "../mercury/types";
import type { CashPosition } from "../intents";

const OPERATING_KINDS = ["checking"];
/** Transaction kinds that are money leaving the company (not moves between our own accounts). */
const OUTFLOW_EXCLUDED_KINDS = new Set(["internalTransfer", "treasuryTransfer"]);

export function isOperatingAccount(a: Account): boolean {
  return a.status === "active" && a.type === "mercury" && OPERATING_KINDS.includes(a.kind.toLowerCase());
}

export function pickOperatingAccount(accounts: Account[]): Account | null {
  const candidates = accounts.filter(isOperatingAccount);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, a) => (a.availableBalance > best.availableBalance ? a : best));
}

/** Average monthly external outflow over the window covered by `transactions`. */
export function averageMonthlyOutflow(transactions: Transaction[], asOf: Date, windowDays = 90): number {
  const since = new Date(asOf.getTime() - windowDays * 86_400_000);
  const outflow = transactions
    .filter((t) => t.amount < 0 && !OUTFLOW_EXCLUDED_KINDS.has(t.kind) && t.status !== "failed" && t.status !== "cancelled")
    .filter((t) => new Date(t.createdAt) >= since && new Date(t.createdAt) <= asOf)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return round2(outflow / (windowDays / 30));
}

export interface FloorOptions {
  /** Explicit floor overrides the heuristic. */
  floor?: number;
  /** Months of outflow to keep in operating. Default 2. */
  monthsOfRunway?: number;
}

export function computeCashPosition(accounts: Account[], transactions: Transaction[], asOf: Date, opts: FloorOptions = {}): CashPosition {
  const active = accounts.filter((a) => a.status === "active" && a.type === "mercury");
  const byKind: Record<string, number> = {};
  for (const a of active) byKind[a.kind] = round2((byKind[a.kind] ?? 0) + a.availableBalance);
  const operating = pickOperatingAccount(active);
  const avgMonthlyOutflow = averageMonthlyOutflow(transactions, asOf);
  const months = opts.monthsOfRunway ?? 2;
  const floor = opts.floor ?? round2(avgMonthlyOutflow * months);
  return {
    asOf: asOf.toISOString().slice(0, 10),
    byKind,
    operating: operating ? { accountId: operating.id, name: operating.nickname ?? operating.name, available: operating.availableBalance } : null,
    totalAvailable: round2(active.reduce((s, a) => s + a.availableBalance, 0)),
    floor,
    floorBasis: opts.floor !== undefined ? "set by you" : `${months}× average monthly outflow over the last 90 days`,
    avgMonthlyOutflow,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
