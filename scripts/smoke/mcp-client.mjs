import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
// Real @modelcontextprotocol/client v2. NOTE: versionNegotiation must be "auto" (or pinned) to speak
// 2026-07-28; the default "legacy" era declares capabilities only at initialize, which a stateless
// server has forgotten by tools/call — see docs/api-friction-log.md #37.
const URL_ = process.env.MCP_URL;
const results = { list: null, close: null, noElicit: null, elicit: null, elicitDecline: null, errors: [] };

async function connect(withElicitation, answer) {
  const client = new Client({ name: "smoke-" + (withElicitation ? "elicit" : "plain"), version: "0.0.1" }, {
    capabilities: withElicitation ? { elicitation: { form: {} } } : {},
    versionNegotiation: { mode: "auto" },
  });
  if (withElicitation) {
    client.setRequestHandler("elicitation/create", async (req) => {
      results.formSeen = { message: req.params.message, mode: req.params.mode, schema: req.params.requestedSchema };
      return answer ? { action: "accept", content: { approve: true } } : { action: "decline" };
    });
  }
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
  return client;
}
const args = { fromAccountId: "acct-chk", fromName: "Operating", toAccountId: "treas-1", toName: "Treasury", toKind: "treasury", amount: 5000 };
try {
  const plain = await connect(false);
  results.list = (await plain.listTools()).tools.map((t) => t.name);
  const close = await plain.callTool({ name: "close_month", arguments: {} });
  results.close = JSON.parse(close.content[0].text);
  const r = await plain.callTool({ name: "propose_sweep", arguments: args });
  results.noElicit = JSON.parse(r.content[0].text);
  await plain.close();

  const el = await connect(true, true);
  const r2 = await el.callTool({ name: "propose_sweep", arguments: args });
  results.elicit = JSON.parse(r2.content[0].text);
  await el.close();

  const el2 = await connect(true, false);
  const r3 = await el2.callTool({ name: "propose_sweep", arguments: args });
  results.elicitDecline = r3.content[0].text;
  await el2.close();
} catch (e) { results.errors.push(String(e?.stack ?? e)); }
const ok = (c, m) => console.log(`${c ? "PASS" : "FAIL"}  ${m}`) || c;
let pass = true;
pass &= ok(JSON.stringify(results.list) === JSON.stringify(["cash_position", "close_month", "propose_payment", "propose_sweep"]), "tools/list → 4 tools");
pass &= ok((results.close?.proposals ?? []).map((p) => p.kind).join() === "followup,pay,pay,unmatched_bill,sweep", "close_month → followup, pay×2, unmatched, sweep");
pass &= ok(results.noElicit?.status === "needs_human_approval" && /\/approve\//.test(results.noElicit?.approve_url ?? ""), "no elicitation capability → approve URL fallback");
pass &= ok(results.formSeen?.mode === "form" && /approval in Mercury/.test(results.formSeen?.message ?? ""), "elicitation capability → form rendered with Approve question");
pass &= ok(results.elicit?.queued?.status === "pendingApproval" && /^tmr-/.test(results.elicit?.queued?.mercuryRequestId ?? ""), "accept → re-entry → request-transfer queued (pendingApproval)");
pass &= ok(/^Declined/.test(results.elicitDecline ?? ""), "decline → nothing queued");
pass &= ok(results.errors.length === 0, "no client errors" + (results.errors.length ? ": " + results.errors[0].slice(0, 200) : ""));
process.exit(pass ? 0 : 1);
