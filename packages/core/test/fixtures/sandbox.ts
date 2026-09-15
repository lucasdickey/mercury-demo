/**
 * Shapes follow the OpenAPI fragments on docs.mercury.com. Values are invented
 * to look like a seeded sandbox org; replace with redacted real rows once
 * PLAN.md §2 (sandbox recon) has run.
 */
import type { Account, Customer, Invoice, Recipient, Transaction, TreasuryAccount } from "../../src/mercury/types";

export const AS_OF = new Date("2026-09-15T12:00:00Z");

export const accounts: Account[] = [
  {
    id: "acct-checking-1",
    name: "Checking ••1234",
    nickname: "Operating",
    kind: "checking",
    status: "active",
    type: "mercury",
    availableBalance: 148_220.14,
    currentBalance: 149_100.14,
    canSendRealTimePayments: true,
    legalBusinessName: "Sandbox Labs, Inc.",
    dashboardLink: "https://app.sandbox.mercury.com/accounts/acct-checking-1",
    createdAt: "2025-01-10T00:00:00Z",
  },
  {
    id: "acct-savings-1",
    name: "Savings ••5678",
    nickname: null,
    kind: "savings",
    status: "active",
    type: "mercury",
    availableBalance: 60_000,
    currentBalance: 60_000,
    canSendRealTimePayments: false,
    legalBusinessName: "Sandbox Labs, Inc.",
    dashboardLink: "https://app.sandbox.mercury.com/accounts/acct-savings-1",
    createdAt: "2025-01-10T00:00:00Z",
  },
  {
    id: "acct-archived",
    name: "Old checking",
    nickname: null,
    kind: "checking",
    status: "archived",
    type: "mercury",
    availableBalance: 999_999,
    currentBalance: 999_999,
    canSendRealTimePayments: false,
    legalBusinessName: "Sandbox Labs, Inc.",
    dashboardLink: "",
    createdAt: "2024-01-10T00:00:00Z",
  },
];

export const treasury: TreasuryAccount[] = [
  { id: "treas-1", status: "active", availableBalance: 250_000, currentBalance: 250_000, netReturns: [] },
];

/** 90 days of outflow totalling exactly 90,000 → avg monthly 30,000 → floor 60,000 at 2× runway. */
export const transactions: Transaction[] = [
  ...[15_000, 15_000, 15_000].map((amt, i) => ({
    id: `txn-payroll-${i}`,
    accountId: "acct-checking-1",
    amount: -amt,
    kind: "outgoingPayment",
    status: "sent" as const,
    counterpartyName: "Deel",
    createdAt: new Date(AS_OF.getTime() - (10 + i * 30) * 86_400_000).toISOString(),
  })),
  ...[12_000, 12_000, 12_000].map((amt, i) => ({
    id: `txn-rent-${i}`,
    accountId: "acct-checking-1",
    amount: -amt,
    kind: "outgoingPayment",
    status: "sent" as const,
    counterpartyName: "Bay Street Properties",
    createdAt: new Date(AS_OF.getTime() - (5 + i * 30) * 86_400_000).toISOString(),
  })),
  ...[3_000, 3_000, 3_000].map((amt, i) => ({
    id: `txn-card-${i}`,
    accountId: "acct-checking-1",
    amount: -amt,
    kind: "debitCardTransaction",
    status: "sent" as const,
    counterpartyName: "AWS",
    mercuryCategory: "Software",
    merchant: { id: "m-aws", categoryCode: "7372" },
    createdAt: new Date(AS_OF.getTime() - (2 + i * 30) * 86_400_000).toISOString(),
  })),
  // Excluded from outflow: internal moves, a failed payment, and something outside the window.
  { id: "txn-int", accountId: "acct-checking-1", amount: -20_000, kind: "internalTransfer", status: "sent", createdAt: new Date(AS_OF.getTime() - 20 * 86_400_000).toISOString() },
  { id: "txn-failed", accountId: "acct-checking-1", amount: -7_777, kind: "outgoingPayment", status: "failed", createdAt: new Date(AS_OF.getTime() - 20 * 86_400_000).toISOString() },
  { id: "txn-old", accountId: "acct-checking-1", amount: -50_000, kind: "outgoingPayment", status: "sent", createdAt: new Date(AS_OF.getTime() - 100 * 86_400_000).toISOString() },
  { id: "txn-in", accountId: "acct-checking-1", amount: 40_000, kind: "incomingDomesticWire", status: "sent", counterpartyName: "Northwind", createdAt: new Date(AS_OF.getTime() - 3 * 86_400_000).toISOString() },
];

export const recipients: Recipient[] = [
  { id: "rcp-acme", name: "Acme Hosting, Inc.", nickname: null, status: "active", defaultPaymentMethod: "ach", emails: ["ap@acmehosting.example"], dateLastPaid: "2026-08-18T00:00:00Z" },
  { id: "rcp-figma", name: "Figma", nickname: null, status: "active", defaultPaymentMethod: "ach", emails: [], dateLastPaid: "2026-08-20T00:00:00Z" },
  { id: "rcp-deel", name: "Deel Inc", nickname: "Deel", status: "active", defaultPaymentMethod: "ach", emails: [], dateLastPaid: "2026-08-30T00:00:00Z" },
  { id: "rcp-vercel", name: "Vercel Inc.", nickname: null, status: "active", defaultPaymentMethod: "ach", emails: [], dateLastPaid: null },
  { id: "rcp-gone", name: "Northstar Legal", nickname: null, status: "deleted", defaultPaymentMethod: "check", emails: [], dateLastPaid: null },
];

export const customers: Customer[] = [
  { id: "cust-northwind", name: "Northwind Traders" },
  { id: "cust-contoso", name: "Contoso" },
  { id: "cust-fabrikam", name: "Fabrikam" },
];

export const invoices: Invoice[] = [
  { id: "inv-31", invoiceNumber: "INV-0031", customerId: "cust-northwind", amount: 12_000, currencyCode: "USD", invoiceDate: "2026-08-01", dueDate: "2026-08-31", status: "Unpaid", destinationAccountId: "acct-checking-1", slug: "inv-0031" },
  { id: "inv-32", invoiceNumber: "INV-0032", customerId: "cust-contoso", amount: 4_500, currencyCode: "USD", invoiceDate: "2026-08-10", dueDate: "2026-09-09", status: "Unpaid", destinationAccountId: "acct-checking-1", slug: "inv-0032" },
  { id: "inv-33", invoiceNumber: "INV-0033", customerId: "cust-fabrikam", amount: 8_000, currencyCode: "USD", invoiceDate: "2026-09-01", dueDate: "2026-10-01", status: "Unpaid", destinationAccountId: "acct-checking-1", slug: "inv-0033" },
  { id: "inv-30", invoiceNumber: "INV-0030", customerId: "cust-northwind", amount: 9_000, currencyCode: "USD", invoiceDate: "2026-07-01", dueDate: "2026-07-31", status: "Paid", destinationAccountId: "acct-checking-1", slug: "inv-0030" },
];

export const fakeReader = {
  listAccounts: async () => accounts,
  listTransactions: async () => transactions,
  listRecipients: async () => recipients,
  listInvoices: async () => invoices,
  listCustomers: async () => customers,
  listTreasury: async () => treasury,
};
