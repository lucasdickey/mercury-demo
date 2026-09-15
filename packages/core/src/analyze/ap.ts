import type { Recipient } from "../mercury/types";
import type { PayProposal, Proposal } from "../intents";
import { daysBetween, fmt } from "./ar";
import { stableId } from "./id";

/**
 * Mercury has no Bill Pay API (friction-log item 29), so "bills due" is a list
 * we maintain outside Mercury. Shape mirrors what a `GET /bills` would return.
 */
export interface Bill {
  vendor: string;
  amount: number;
  due: string; // YYYY-MM-DD
  memo: string;
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchRecipient(vendor: string, recipients: Recipient[]): Recipient | undefined {
  const v = normalizeName(vendor);
  const active = recipients.filter((r) => r.status === "active");
  return (
    active.find((r) => normalizeName(r.nickname ?? "") === v) ??
    active.find((r) => normalizeName(r.name) === v) ??
    active.find((r) => normalizeName(r.name).includes(v) || v.includes(normalizeName(r.name)))
  );
}

export interface ApOptions {
  /** Bills due within this many days are proposed. Default 7. */
  withinDays?: number;
}

/** Bills due soon, matched to saved recipients → pay proposals (approval required). */
export function billsDue(bills: Bill[], recipients: Recipient[], fromAccountId: string, asOf: Date, opts: ApOptions = {}): Proposal[] {
  const within = opts.withinDays ?? 7;
  const out: Proposal[] = [];
  for (const b of bills) {
    const daysUntil = -daysBetween(b.due, asOf);
    if (daysUntil > within) continue;
    const r = matchRecipient(b.vendor, recipients);
    if (!r) {
      out.push({
        kind: "unmatched_bill",
        id: stableId("unmatched", b.vendor + b.due, asOf),
        why: `${b.vendor} (${fmt(b.amount)}, due ${b.due}) has no saved recipient in Mercury; invite them before paying.`,
        evidence: [],
        requires_approval: false,
        reversible: true,
        vendor: b.vendor,
        amount: b.amount,
        due: b.due,
      });
      continue;
    }
    const overdue = daysUntil < 0;
    const proposal: PayProposal = {
      kind: "pay",
      id: stableId("pay", r.id + b.due + b.amount, asOf),
      why: overdue
        ? `${r.name} was due ${b.due} (${-daysUntil} days ago) for ${fmt(b.amount)}.`
        : `${r.name} is due ${b.due} (in ${daysUntil} day${daysUntil === 1 ? "" : "s"}) for ${fmt(b.amount)}.`,
      evidence: [r.id],
      requires_approval: true,
      reversible: false,
      fromAccountId,
      recipientId: r.id,
      recipientName: r.name,
      amount: b.amount,
      paymentMethod: r.defaultPaymentMethod === "internationalWire" ? "internationalWire" : "ach",
      due: b.due,
      memo: b.memo,
    };
    out.push(proposal);
  }
  return out.sort((a, b) => (a.kind === "pay" && b.kind === "pay" ? a.due.localeCompare(b.due) : 0));
}
