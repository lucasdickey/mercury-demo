#!/usr/bin/env node
// Run just before a demo: npm run demo:prep
// Read-only against Mercury. Writes .demo/bills.json (bills due, dated from today,
// matched to a real ACH recipient in the sandbox) and previews close_month through
// the running app. Env: DEMO_URL (default http://localhost:3200).
import dns from "node:dns";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

dns.setDefaultResultOrder("ipv4first"); // allowlist is IPv4 (friction log #44)
const API = "https://api-sandbox.mercury.com/api/v1";
const APP = process.env.DEMO_URL ?? "http://localhost:3200";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), unquote(l.slice(l.indexOf("=") + 1))]),
);
/** `vercel env pull` writes values in double quotes; dotenv strips them, our parsing must too. */
function unquote(v) {
  return v.replace(/^"(.*)"$/s, "$1");
}
const ok = (m) => console.log(`✓ ${m}`);
const warn = (m) => console.log(`! ${m}`);
const fail = (m) => (console.log(`✗ ${m}`), process.exit(1));

async function get(path) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${env.MERCURY_SANDBOX_API_TOKEN}` } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) fail(`GET ${path} → ${r.status} ${JSON.stringify(body.errors ?? body).slice(0, 160)}`);
  return body;
}

// 1. Token
if (!env.MERCURY_SANDBOX_API_TOKEN) fail("MERCURY_SANDBOX_API_TOKEN missing from .env.local (scripts/set-token.sh)");
const { accounts } = await get("/accounts");
ok(`sandbox token works (${accounts.length} accounts)`);

// 2. A recipient Mercury can actually pay by ACH
const { recipients } = await get("/recipients?limit=1000");
const payable = recipients.filter((r) => r.status === "active" && r.defaultPaymentMethod === "ach" && r.electronicRoutingInfo && !/banned/i.test(r.name));
const payee = payable.find((r) => r.name === "Alex Rivera") ?? payable[0];
if (!payee) fail("no active ACH recipient with bank details in the sandbox; add one in the dashboard");
ok(`ACH payee: ${payee.name}`);

// 3. Bills due, relative to today. Only the payee's bill can become a payment; the
//    others show what "no saved recipient" and "outside this week" look like.
//    DEMO_PAY_AMOUNT changes the payee's bill for a same-day retake: the proposal id
//    (Mercury's idempotency key) is payee + due + amount + day, so a new amount is a new request.
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const bills = [
  { vendor: payee.name, amount: Number(process.env.DEMO_PAY_AMOUNT ?? 1250), due: day(2), memo: "Contract design work" },
  { vendor: "Acme Hosting", amount: 4200, due: day(3), memo: "Hosting" },
  { vendor: "Northstar Legal", amount: 3150, due: day(-4), memo: "Invoice 2211, trademark filing" },
  { vendor: "Deel", amount: 18500, due: day(20), memo: "Contractor payroll" },
];
mkdirSync(".demo", { recursive: true });
writeFileSync(".demo/bills.json", JSON.stringify(bills, null, 2) + "\n");
ok(`.demo/bills.json: ${bills.map((b) => `${b.vendor} due ${b.due}`).join(" · ")}`);

// 4. Leftovers in the approval queue from earlier runs (the API can't cancel them)
const { requests } = await get("/request-send-money?status=pendingApproval");
if (requests.length) warn(`${requests.length} payment request(s) still pending from earlier runs. For a clean demo, reject them: https://sandbox.mercury.com/payments/approvals`);
else ok("approval queue is clear (API view; the dashboard can show more, friction log #63)");

// 5. Preview close_month through the running app
if (!env.MCP_PATH_SECRET) fail("MCP_PATH_SECRET missing from .env.local");
try {
  const client = new Client({ name: "demo-prep", version: "0" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${APP}/api/mcp/${env.MCP_PATH_SECRET}`)));
  const report = JSON.parse((await client.callTool({ name: "close_month", arguments: {} })).content[0].text);
  await client.close();
  const count = (k) => report.proposals.filter((p) => p.kind === k).length;
  ok(`close_month via ${APP}: ${count("pay")} payment, ${count("unmatched_bill")} unmatched bill(s), ${count("sweep")} sweep, ${count("followup")} follow-up(s)`);
  if (!count("pay")) warn("no payment proposal; is the app reading .demo/bills.json? (STEWARD_BILLS_FILE)");
} catch (e) {
  fail(`app not reachable at ${APP} (${String(e).slice(0, 120)}). Start it: env -u ANTHROPIC_API_KEY PORT=3200 PUBLIC_BASE_URL=${APP} npm run dev`);
}

console.log(`\nReady. In Claude Code:\n  claude mcp add --transport http steward "${APP}/api/mcp/${env.MCP_PATH_SECRET}"`);
