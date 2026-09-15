# API & docs friction log — agent-consumption lens

Running log. Each entry: what I hit → why it hurts an agent/MCP/CLI consumer →
what I'd ship. Severity: 🔴 blocks or misleads agents, 🟠 costs tokens/time,
🟡 polish. Add to this as we build.

## Discovery & AEO

1. 🟡 **`llms.txt` exists and `.md` suffix works — genuinely good.** Every page also
   opens with "Fetch the complete documentation index at llms.txt" — nice agent
   affordance. Keep. But there is no `llms-full.txt`, so an agent that wants the
   whole surface must make ~100 fetches.
2. 🔴 **No single OpenAPI document.** `/openapi.json`, `/openapi.yaml` → 404. Each
   reference page embeds its *own* OpenAPI fragment with the full component
   schema tree re-inlined. `listtransactions.md` is 45 KB, most of it 14
   international-wire country schemas irrelevant to a GET. Five pages ≈ 200 KB of
   ~80 % duplicate JSON into an agent's context. **Ship:** one `openapi.json`
   (and link it from `llms.txt` + `/.well-known`), and prune per-page fragments to
   referenced schemas only.
3. 🟠 **Inconsistent / empty one-liners in `llms.txt`.** "Get transaction by ID" and
   "Get all events" have no description; two endpoints are titled "Get transaction
   by ID" vs "Get a transaction by ID" (`gettransaction` = account-scoped,
   `gettransactionbyid` = org-scoped). An agent picking tools by title will
   confuse them. **Ship:** normalize titles to `<verb> <resource> (<scope>)`.
4. 🟡 **OpenAPI `info.description` is boilerplate** ("Enables user registration,
   balance tracking…") — Mercury has no user registration endpoint. This string
   is what MCP clients / API directories surface. Fix the copy.
5. 🟡 **Third-party "Mercury MCP" servers** (glama, GitHub) rank alongside the
   official one; only the security page states the official URL. Put the official
   MCP URL + CLI install on `docs/welcome`, and publish a `security.txt`-style
   "official agent endpoints" list.

## Auth & scopes

6. 🔴 **Scope catalog is undocumented.** Custom tokens have per-endpoint scopes,
   some "with an asterisk" needing an IP allowlist — but the list only exists in
   the dashboard modal. The OpenAPI `security` block says `bearerAuth` for
   everything. An agent cannot reason about "what token do I need for X."
   **Ship:** per-operation `x-mercury-scope` + `x-requires-ip-allowlist` in the
   spec; render a scope table in Getting Started.
7. 🟠 **Auth story is told three ways.** Getting Started leads with HTTP Basic;
   OpenAPI says Bearer; MCP uses OAuth with a single `read` scope; CLI uses OAuth
   *or* API key with precedence rules. Fine for humans, noisy for agents. Lead
   with Bearer everywhere; footnote Basic.
8. 🔴 **IP allowlist for write tokens is hostile to agent runtimes** (laptops,
   Claude Code, serverless). Mercury's own workaround is `requestSendMoney`
   (approval replaces allowlist) — the right idea — but it's only mentioned in
   passing and **not in the MCP**. **Ship:** a `propose` scope tier for MCP/OAuth
   (`propose:payments`, `propose:transfers`, `write:categories`) that maps to the
   request-*-approval endpoints. Agents propose; humans approve in the dashboard
   (or Command). This is the single biggest product gap.
9. 🟠 **45-day auto-downgrade / auto-delete** is silent to the integrating code:
   a write scope vanishes and calls start failing. No documented error body for
   "scope downgraded." **Ship:** distinct error code + `WWW-Authenticate`
   hint; expose token metadata endpoint (`GET /token/self` → scopes, expiry).

## Errors, limits, pagination

10. 🔴 **No error schema.** Every 4xx in the spec is a bare description
    (`"400": "Invalid body"`). Agents self-correct off structured errors; today
    they get prose. **Ship:** RFC 9457 problem+json with `code`, `field`, `hint`.
11. 🟠 **Rate limits unpublished** (also flagged by supergood's D+ report card).
    No `Retry-After` / `X-RateLimit-*` documented. MCP `listTransactions`
    "automatically handles pagination" — great, but the ceiling is unknown.
12. 🟠 **Duplicate read paths** — `/transactions` vs `/account/{id}/transactions`;
    `/transaction/{id}` vs `/account/{id}/transaction/{id}`. Org-scoped
    `/transactions` is strictly more capable (category filters, `cardId[]`).
    Mark the account-scoped pair as legacy in the spec so tool selection is
    unambiguous.
13. 🟠 **24-hour duplicate guard on `createTransaction`** returns a generic 400
    even with a fresh `idempotencyKey`. Agents retrying "safely" get a confusing
    failure. Return 409 with `code: duplicate_payment_window`.

## MCP specifics

14. 🔴 **Read-only MCP means every "do X" prompt dead-ends.** No categorize, no
    note, no request-send-money, no create-recipient-invite. Even non-financial
    writes (`updateTransaction` note/category) are excluded — and "transaction
    cleanup" is the #1 thing Mercury says early users want.
15. 🟠 **No aggregate tools.** Every analytic question ("spend by category last 90
    days") becomes "page 1000 rows into context." A hosted MCP can serve
    `spendSummary(groupBy, window)`, `recurringStreams()`, `idleCash()` cheaply
    server-side. Mercury already computes these for the dashboard.
16. 🟡 **Tool descriptions are the OpenAPI one-liners.** No guidance on
    `listTransactions` vs `getAccountStatements`, no MCP *prompts* or *resources*
    (e.g. a `mercury://categories` resource). No sample-prompt metadata reaches
    the model.
17. 🟡 **OAuth metadata gaps Mercury itself documents**: 401 lacks
    `resource_metadata` in `WWW-Authenticate`; PRM only at root, not at
    `/.well-known/oauth-protected-resource/mcp`. Generic clients need hardcoding.
18. 🟡 **No sandbox MCP host.** You can't demo the official MCP without a real
    account. (Same for CLI — `--base-url` only.)

## Data model gaps (the ones that block an efficiency agent)

19. 🔴 **No recurring-stream signal.** No `isRecurring`, no cadence, no
    "expected next charge." Plaid ships `/transactions/recurring/get`; Mercury
    has the raw MCC + merchant id to compute it. **Ship:** `GET /recurring`
    (streams with cadence, avg amount, last seen, status) — also as an MCP tool.
20. 🔴 **No merchant enrichment.** `merchant.id` exists but there's no
    `GET /merchant/{id}`; `listMerchants` is only spend-control priority
    merchants. No logo, domain, plan/tier hints, cancel URL.
21. 🟠 **Agent cards can't be created via API** (`isAgentCard` is response-only).
    The agent-payments story requires a dashboard click. Add
    `agent: { budgetId, merchantLock, categoryLocks }` to `POST /cards`.
22. 🟠 **Approval requests emit no events/webhooks** (docs say poll). An agent
    that proposed a payment can't be told it was approved/rejected.
23. 🟠 **Personal accounts are invisible in the docs** even though
    `personalBankingSubscriptionFee` is in the enum and Command covers personal.
    Say which endpoints work on personal; which 403.

## Sandbox

24. 🟠 No webhooks in sandbox (documented). Unknown: cards, agent cards, vault,
    events, MCC coverage on seeded data. Will log as we hit them.

## Ecosystem (not Mercury's fault, but shapes what Mercury should build)

25. 🔴 **Consumer chat clients can't render an approval.** MCP elicitation (form
    mode) works in Claude Code, Cursor, VS Code, and the Vercel AI SDK client;
    **Claude.ai** has an open request (anthropics/claude-ai-mcp#153, Apr 2026)
    and turns a state-only `InputRequiredResult` into "Error occurred during
    tool execution" (#1027, Sep 2026); ChatGPT shows no evidence of support.
    So "propose, approve in chat" is a developer-client story today.
    **Ship (Mercury):** a hosted approval page reachable by URL — the
    approval-queue endpoints already exist; a `/approve/{requestId}` deep link
    into the dashboard, returned by the API, would let any client complete the
    loop. (`dashboardLink` already exists on accounts and transactions; add it
    to `SendMoneyApprovalRequestResponse`.)
26. 🟠 **Spec churn.** MCP 2026-07-28 made elicitation stateless (MRTR) and
    deprecated sampling/roots. Mercury's MCP docs don't state which protocol
    version the server speaks or which client features it uses. Add a
    "protocol version + capabilities" line to *Connecting Mercury MCP*.
