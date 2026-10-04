#!/usr/bin/env node
// Read-only sweep of the Mercury sandbox (PLAN.md §2). GETs only — never writes.
// Usage: node scripts/recon/sweep.mjs <out.json>
// Reads MERCURY_SANDBOX_API_TOKEN from .env.local. Never prints the token.
import dns from "node:dns";
import { readFileSync, writeFileSync } from "node:fs";

dns.setDefaultResultOrder("ipv4first"); // allowlist is IPv4 (friction #44)

const BASE = "https://api-sandbox.mercury.com/api/v1";
const out = process.argv[2];
if (!out) throw new Error("usage: sweep.mjs <out.json>");

const token = readFileSync(".env.local", "utf8")
  .split("\n")
  .filter((l) => l.startsWith("MERCURY_SANDBOX_API_TOKEN="))
  .pop()
  ?.slice("MERCURY_SANDBOX_API_TOKEN=".length)
  .replace(/^"(.*)"$/s, "$1"); // `vercel env pull` quotes values
if (!token) throw new Error("MERCURY_SANDBOX_API_TOKEN missing from .env.local");

const REDACT = new Set(["accountNumber", "routingNumber", "ein", "taxId", "ssn", "pan", "cvc", "iban", "swiftCode"]);
const redact = (v) =>
  Array.isArray(v)
    ? v.map(redact)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, REDACT.has(k) ? "<redacted>" : redact(x)]))
      : v;

const HEADERS = /^(x-ratelimit|ratelimit|retry-after|x-request-id|content-type|cf-cache-status|link)/i;

async function get(path, query = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const t0 = Date.now();
  let res, text;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    text = await res.text();
  } catch (e) {
    return { path, query, error: String(e) };
  }
  const headers = Object.fromEntries([...res.headers].filter(([k]) => HEADERS.test(k)));
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _nonJson: text.slice(0, 300) };
  }
  return { path, query, status: res.status, ms: Date.now() - t0, bytes: text.length, headers, body: redact(body) };
}

/** Field presence/type stats across an array of objects (one level + nested keys dotted). */
function shape(items) {
  const stats = {};
  const walk = (o, prefix) => {
    for (const [k, v] of Object.entries(o)) {
      const key = prefix + k;
      const s = (stats[key] ??= { present: 0, nonNull: 0, types: new Set(), examples: new Set() });
      s.present++;
      if (v !== null && v !== undefined) s.nonNull++;
      s.types.add(v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
      if (typeof v === "string" && s.examples.size < 6 && v.length < 60) s.examples.add(v);
      if (v && typeof v === "object" && !Array.isArray(v) && prefix.split(".").length < 3) walk(v, key + ".");
    }
  };
  items.forEach((i) => i && typeof i === "object" && walk(i, ""));
  return Object.fromEntries(
    Object.entries(stats).map(([k, s]) => [k, { present: s.present, nonNull: s.nonNull, types: [...s.types], examples: [...s.examples] }]),
  );
}

const listKey = (body) => Object.keys(body ?? {}).find((k) => Array.isArray(body[k]));
const results = [];
const record = async (label, path, query) => {
  const r = await get(path, query);
  const key = r.body && listKey(r.body);
  const items = key ? r.body[key] : null;
  results.push({
    label,
    ...r,
    listKey: key ?? null,
    count: items?.length ?? null,
    page: r.body?.page ?? null,
    topKeys: r.body && typeof r.body === "object" ? Object.keys(r.body) : null,
    shape: items ? shape(items) : r.status === 200 ? shape([r.body]) : null,
    sample: items ? items.slice(0, 2) : r.body,
    body: undefined,
    full: items && items.length <= 300 ? items : undefined,
  });
  process.stderr.write(`${String(r.status ?? "ERR").padEnd(4)} ${label.padEnd(34)} ${path}${Object.keys(query ?? {}).length ? "?" + new URLSearchParams(query) : ""} ${items ? `(${items.length})` : ""}\n`);
  return { r, items: items ?? [] };
};

// --- lists ---
const { items: accounts = [] } = await record("accounts", "/accounts");
const { items: txns = [] } = await record("transactions (all, limit 1000)", "/transactions", { limit: "1000" });
await record("transactions (limit 2, page shape)", "/transactions", { limit: "2" });
await record("transactions (last 90d)", "/transactions", { limit: "1000", start: new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10) });
const { items: recipients = [] } = await record("recipients", "/recipients");
await record("recipients/attachments", "/recipients/attachments");
await record("recipients/invites", "/recipients/invites");
const { items: invoices = [] } = await record("ar/invoices", "/ar/invoices");
const { items: customers = [] } = await record("ar/customers", "/ar/customers");
const { items: treasury = [] } = await record("treasury", "/treasury");
await record("credit", "/credit");
await record("categories", "/categories");
await record("merchants (limit 5)", "/merchants", { limit: "5" });
await record("organization", "/organization");
const { items: users = [] } = await record("users", "/users");
const { items: cards = [] } = await record("cards", "/cards");
await record("request-send-money", "/request-send-money");
await record("events (limit 5)", "/events", { limit: "5" });
await record("webhooks", "/webhooks");
await record("safes", "/safes");

// --- per-account / detail ---
for (const a of accounts) {
  await record(`account ${a.kind ?? a.type}/${a.name} txns`, `/account/${a.id}/transactions`, { limit: "500" });
  await record(`account ${a.name} cards`, `/account/${a.id}/cards`);
  await record(`account ${a.name} statements`, `/account/${a.id}/statements`);
}
await record("GET /account/{id} (undocumented?)", `/account/${accounts[0]?.id}`);
for (const t of treasury) {
  await record(`treasury ${t.id} transactions`, `/treasury/${t.id}/transactions`);
  await record(`treasury ${t.id} statements`, `/treasury/${t.id}/statements`);
}
if (txns[0]) {
  await record("transaction by id (org)", `/transaction/${txns[0].id}`);
  await record("transaction by id (account)", `/account/${txns[0].accountId}/transaction/${txns[0].id}`);
}
if (recipients[0]) await record("recipient by id", `/recipient/${recipients[0].id}`);
if (invoices[0]) {
  await record("invoice by id", `/ar/invoices/${invoices[0].id}`);
  await record("invoice attachments", `/ar/invoices/${invoices[0].id}/attachments`);
}
if (customers[0]) await record("customer by id", `/ar/customers/${customers[0].id}`);
if (users[0]) await record("user by id", `/users/${users[0].id}`);
if (cards[0]) await record("card by id", `/cards/${cards[0].id ?? cards[0].cardId}`);

// --- error shapes & edge behavior ---
await record("ERR unknown txn id", "/transaction/00000000-0000-0000-0000-000000000000");
await record("ERR malformed txn id", "/transaction/not-a-uuid");
await record("ERR bad date", "/transactions", { start: "yesterday" });
await record("ERR limit over max", "/transactions", { limit: "100000" });
await record("ERR unknown path", "/invoices");
await record("ERR request-transfer list (no GET documented)", "/request-transfer");

writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
process.stderr.write(`\nwrote ${results.length} probes → ${out}\n`);
