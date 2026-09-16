import type {
  Account,
  Customer,
  Invoice,
  Page,
  Recipient,
  SendMoneyApprovalRequest,
  SendMoneyRequestBody,
  Transaction,
  TransferApprovalRequest,
  TransferRequestBody,
  TreasuryAccount,
} from "./types";

export const SANDBOX_BASE_URL = "https://api-sandbox.mercury.com/api/v1";
export const PRODUCTION_BASE_URL = "https://api.mercury.com/api/v1";

export interface MercuryClientOptions {
  token: string;
  /** Defaults to the sandbox. Production is refused unless `allowProduction` is set (PLAN.md §6). */
  baseUrl?: string;
  allowProduction?: boolean;
  fetch?: typeof fetch;
}

export class MercuryApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`Mercury ${method} ${path} → ${status}: ${body.slice(0, 300)}`);
    this.name = "MercuryApiError";
  }
}

/** Fields we never let leave the client. Recursive. */
const REDACTED_KEYS = new Set(["accountNumber", "routingNumber", "iban", "swiftCode", "cvc", "pan"]);

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(k)) continue;
      out[k] = redact(v);
    }
    return out as T;
  }
  return value;
}

/**
 * `start`/`end` filter on createdAt; `postedStart`/`postedEnd` on postedAt, which is
 * what the dashboard shows and what a period close needs (friction log #47).
 */
export interface TransactionFilter {
  start?: string;
  end?: string;
  postedStart?: string;
  postedEnd?: string;
  accountId?: string[];
}

export interface MercuryReader {
  listAccounts(): Promise<Account[]>;
  listTransactions(opts?: TransactionFilter): Promise<Transaction[]>;
  listRecipients(): Promise<Recipient[]>;
  listInvoices(): Promise<Invoice[]>;
  listCustomers(): Promise<Customer[]>;
  listTreasury(): Promise<TreasuryAccount[]>;
}

export interface MercuryProposer {
  requestSendMoney(accountId: string, body: SendMoneyRequestBody): Promise<SendMoneyApprovalRequest>;
  requestTransferMoney(body: TransferRequestBody): Promise<TransferApprovalRequest>;
  listSendMoneyApprovalRequests(): Promise<SendMoneyApprovalRequest[]>;
}

export class MercuryClient implements MercuryReader, MercuryProposer {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MercuryClientOptions) {
    const baseUrl = (opts.baseUrl ?? SANDBOX_BASE_URL).replace(/\/$/, "");
    if (baseUrl.startsWith(PRODUCTION_BASE_URL) && !opts.allowProduction) {
      throw new Error("MercuryClient: production base URL refused. Steward is sandbox-only (PLAN.md §6).");
    }
    if (!opts.token.startsWith("secret-token:")) {
      throw new Error("MercuryClient: token must include the 'secret-token:' prefix.");
    }
    this.baseUrl = baseUrl;
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  get environment(): "sandbox" | "production" | "custom" {
    if (this.baseUrl === SANDBOX_BASE_URL) return "sandbox";
    if (this.baseUrl === PRODUCTION_BASE_URL) return "production";
    return "custom";
  }

  private async request<T>(method: "GET" | "POST", path: string, query?: Record<string, string | string[] | undefined>, body?: unknown): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
      else url.searchParams.set(k, v);
    }
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new MercuryApiError(res.status, method, path, text);
    return redact(JSON.parse(text) as T);
  }

  /** Follows Mercury's cursor pagination (`page.nextPage` → `start_after`). */
  private async paginate<T>(path: string, key: string, query: Record<string, string | string[] | undefined> = {}): Promise<T[]> {
    const out: T[] = [];
    let startAfter: string | undefined;
    for (let i = 0; i < 50; i++) {
      const res = await this.request<Record<string, unknown> & { page?: Page }>("GET", path, { ...query, limit: "1000", start_after: startAfter });
      const items = (res[key] as T[] | undefined) ?? [];
      out.push(...items);
      const next = res.page?.nextPage ?? null;
      if (!next || items.length === 0) break;
      startAfter = next;
    }
    return out;
  }

  listAccounts() {
    return this.paginate<Account>("/accounts", "accounts");
  }
  listTransactions(opts: TransactionFilter = {}) {
    const { start, end, postedStart, postedEnd, accountId } = opts;
    return this.paginate<Transaction>("/transactions", "transactions", { start, end, postedStart, postedEnd, accountId });
  }
  listRecipients() {
    return this.paginate<Recipient>("/recipients", "recipients");
  }
  /** Note: the AR endpoints live under `/ar/…`, unlike every other resource (friction log). */
  listInvoices() {
    return this.paginate<Invoice>("/ar/invoices", "invoices");
  }
  listCustomers() {
    return this.paginate<Customer>("/ar/customers", "customers");
  }
  listTreasury() {
    return this.paginate<TreasuryAccount>("/treasury", "accounts");
  }
  listSendMoneyApprovalRequests() {
    return this.paginate<SendMoneyApprovalRequest>("/request-send-money", "requests");
  }

  /** Queues a payment for dashboard approval. Never sends directly. Needs an org member other than the token owner who can approve (friction log #58). */
  requestSendMoney(accountId: string, body: SendMoneyRequestBody) {
    return this.request<SendMoneyApprovalRequest>("POST", `/account/${accountId}/request-send-money`, undefined, body);
  }
  /** Queues an internal transfer for dashboard approval. */
  requestTransferMoney(body: TransferRequestBody) {
    return this.request<TransferApprovalRequest>("POST", "/request-transfer", undefined, body);
  }
}
