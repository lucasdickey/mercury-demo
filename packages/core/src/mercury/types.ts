/**
 * Hand-typed from the per-endpoint OpenAPI fragments on docs.mercury.com
 * (there is no single spec file to codegen from — friction-log item 2).
 * Only the fields Steward reads are typed; everything else is passed through.
 */

export type AccountStatus = "active" | "deleted" | "pending" | "archived";

export interface Account {
  id: string;
  name: string;
  nickname: string | null;
  /** "checking" | "savings" | "treasury" | "credit" | … — free-form string in the spec. */
  kind: string;
  status: AccountStatus;
  type: "mercury" | "external" | "recipient";
  availableBalance: number;
  currentBalance: number;
  canSendRealTimePayments: boolean;
  legalBusinessName: string;
  dashboardLink: string;
  createdAt: string;
  // accountNumber / routingNumber exist on the wire; the client strips them.
}

export type TransactionStatus = "pending" | "sent" | "cancelled" | "failed" | "reversed" | "blocked";

export interface Transaction {
  id: string;
  accountId: string;
  amount: number; // negative = debit
  kind: string; // TransactionKind enum (23 values); see landscape.md
  status: TransactionStatus;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  counterpartyNickname?: string | null;
  bankDescription?: string | null;
  mercuryCategory?: string | null;
  merchant?: { id?: string | null; categoryCode?: string | null; category?: string | null } | null;
  note?: string | null;
  externalMemo?: string | null;
  createdAt: string;
  postedAt?: string | null;
  estimatedDeliveryDate?: string | null;
  dashboardLink?: string;
}

export type PaymentMethod = "ach" | "check" | "domesticWire" | "internationalWire" | "realTimePayment";

export interface Recipient {
  id: string;
  name: string;
  nickname: string | null;
  status: "active" | "deleted";
  defaultPaymentMethod: PaymentMethod;
  emails: string[];
  dateLastPaid: string | null;
  isBusiness?: boolean | null;
}

export type InvoiceStatus = "Unpaid" | "Paid" | "Cancelled" | "Processing";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  amount: number;
  currencyCode: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  status: InvoiceStatus;
  destinationAccountId: string;
  internalNote?: string | null;
  slug: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string | null;
}

export interface TreasuryAccount {
  id: string;
  status: AccountStatus;
  availableBalance: number;
  currentBalance: number;
  netReturns: Array<{ month?: string; netReturn?: number; dividends?: number; fees?: number }>;
}

export type ReviewRequestStatus = "pendingApproval" | "approved" | "rejected" | "cancelled";

export interface SendMoneyRequestBody {
  recipientId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  note?: string;
  externalMemo?: string;
}

export interface SendMoneyApprovalRequest {
  requestId: string;
  accountId: string;
  recipientId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: ReviewRequestStatus;
  memo?: string | null;
  requestedByUserId: string;
  requesterMayApprove?: boolean | null;
  numberOfApproversRequired?: number | null;
  reviews: unknown[];
  createdAt: string;
}

export interface TransferRequestBody {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  idempotencyKey: string;
  note?: string | null;
}

export interface TransferApprovalRequest {
  requestId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  status: ReviewRequestStatus;
  note?: string | null;
  requestedByUserId: string;
  reviews: unknown[];
  createdAt: string;
}

export interface Page {
  nextPage?: string | null;
  previousPage?: string | null;
}
