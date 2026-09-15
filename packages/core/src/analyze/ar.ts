import type { Customer, Invoice } from "../mercury/types";
import type { FollowupProposal } from "../intents";
import { stableId } from "./id";

const DAY = 86_400_000;

export function daysBetween(a: string, asOf: Date): number {
  return Math.floor((asOf.getTime() - new Date(a + "T00:00:00Z").getTime()) / DAY);
}

/** Overdue receivables → follow-up drafts. Mercury has no reminder API, so these never require approval. */
export function overdueInvoices(invoices: Invoice[], customers: Customer[], asOf: Date): FollowupProposal[] {
  const byCustomer = new Map(customers.map((c) => [c.id, c]));
  return invoices
    .filter((i) => i.status === "Unpaid" && daysBetween(i.dueDate, asOf) > 0)
    .map((i) => {
      const daysLate = daysBetween(i.dueDate, asOf);
      const customer = byCustomer.get(i.customerId);
      const name = customer?.name ?? i.customerId;
      return {
        kind: "followup" as const,
        id: stableId("followup", i.id, asOf),
        why: `${name} owes ${fmt(i.amount)} on ${i.invoiceNumber}, ${daysLate} day${daysLate === 1 ? "" : "s"} past due.`,
        evidence: [i.id],
        requires_approval: false,
        reversible: true,
        invoiceId: i.id,
        invoiceNumber: i.invoiceNumber,
        customerId: i.customerId,
        customerName: customer?.name,
        amount: i.amount,
        dueDate: i.dueDate,
        daysLate,
        draft: `Hi ${name} — a quick note that invoice ${i.invoiceNumber} for ${fmt(i.amount)} was due ${i.dueDate}. Could you let us know when we can expect payment? Thanks.`,
      };
    })
    .sort((a, b) => b.daysLate - a.daysLate);
}

export function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
