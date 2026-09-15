// Minimal Mercury sandbox stand-in for offline smoke tests. Shapes follow docs.mercury.com fragments.
import { createServer } from "node:http";
const log = [];
const accounts = [
  { id: "acct-chk", name: "Checking", nickname: "Operating", kind: "checking", status: "active", type: "mercury", availableBalance: 148220.14, currentBalance: 148220.14, canSendRealTimePayments: true, legalBusinessName: "Sandbox Labs", dashboardLink: "", createdAt: "2025-01-01T00:00:00Z", accountNumber: "SHOULD-BE-REDACTED", routingNumber: "SHOULD-BE-REDACTED" },
  { id: "acct-sav", name: "Savings", nickname: null, kind: "savings", status: "active", type: "mercury", availableBalance: 60000, currentBalance: 60000, canSendRealTimePayments: false, legalBusinessName: "Sandbox Labs", dashboardLink: "", createdAt: "2025-01-01T00:00:00Z" },
];
const now = Date.now(), d = (n) => new Date(now - n * 864e5).toISOString();
const transactions = [10, 40, 70].flatMap((n, i) => [
  { id: `t-p${i}`, accountId: "acct-chk", amount: -15000, kind: "outgoingPayment", status: "sent", counterpartyName: "Deel", createdAt: d(n) },
  { id: `t-r${i}`, accountId: "acct-chk", amount: -15000, kind: "outgoingPayment", status: "sent", counterpartyName: "Landlord", createdAt: d(n + 2) },
]);
const recipients = [
  { id: "rcp-acme", name: "Acme Hosting, Inc.", nickname: null, status: "active", defaultPaymentMethod: "ach", emails: [], dateLastPaid: null, electronicRoutingInfo: { accountNumber: "SHOULD-BE-REDACTED", routingNumber: "x", electronicAccountType: "businessChecking" } },
  { id: "rcp-figma", name: "Figma", nickname: null, status: "active", defaultPaymentMethod: "ach", emails: [], dateLastPaid: null },
];
const invoices = [{ id: "inv-1", invoiceNumber: "INV-1", customerId: "c1", amount: 12000, currencyCode: "USD", invoiceDate: "2026-08-01", dueDate: "2026-08-31", status: "Unpaid", destinationAccountId: "acct-chk", slug: "inv-1" }];
const customers = [{ id: "c1", name: "Northwind" }];
const treasury = [{ id: "treas-1", status: "active", availableBalance: 250000, currentBalance: 250000, netReturns: [] }];
const page = { nextPage: null, previousPage: null };
createServer((req, res) => {
  const u = new URL(req.url, "http://x"); let body = "";
  req.on("data", (c) => (body += c)); req.on("end", () => {
    log.push(`${req.method} ${u.pathname}${body ? " " + body : ""}`);
    const send = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (u.pathname === "/__log") return send(log);
    if (u.pathname === "/api/v1/accounts") return send({ accounts, page });
    if (u.pathname === "/api/v1/transactions") return send({ transactions, page });
    if (u.pathname === "/api/v1/recipients") return send({ recipients, page, total: 2 });
    if (u.pathname === "/api/v1/ar/invoices") return send({ invoices, page });
    if (u.pathname === "/api/v1/ar/customers") return send({ customers, page });
    if (u.pathname === "/api/v1/treasury") return send({ accounts: treasury, page });
    if (req.method === "POST" && u.pathname === "/api/v1/request-transfer") { const b = JSON.parse(body); return send({ requestId: "tmr-" + b.idempotencyKey.slice(-6), status: "pendingApproval", sourceAccountId: b.sourceAccountId, destinationAccountId: b.destinationAccountId, amount: b.amount, requestedByUserId: "u1", reviews: [], createdAt: new Date().toISOString() }); }
    if (req.method === "POST" && /^\/api\/v1\/account\/[^/]+\/request-send-money$/.test(u.pathname)) { const b = JSON.parse(body); return send({ requestId: "smr-" + b.idempotencyKey.slice(-6), status: "pendingApproval", accountId: "acct-chk", recipientId: b.recipientId, amount: b.amount, paymentMethod: b.paymentMethod, requestedByUserId: "u1", reviews: [], createdAt: new Date().toISOString() }); }
    res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "mock: no route " + u.pathname }));
  });
}).listen(3998, () => console.log("mock mercury on :3998"));
