# API & docs friction log — agent-consumption lens

> **Start with [`findings.md`](findings.md)** — the BLUF and top five. This file is the raw, numbered log it summarizes.

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

## Added 2026-09-15 (business pivot; layer-tagged)

27. 🟠 `[sandbox]` `[docs]` **Sandbox contents are undocumented.** The guide says
    "pre-loaded with organizations, accounts, transactions, and balances" and
    that AR and payments work; it does not say whether treasury, credit, cards,
    approval queues, events, or MCC/category data exist in the sandbox, or how
    many recipients/invoices are seeded. A builder has to discover this by
    probing. **Ship:** a "What's in the sandbox" table (seeded objects + counts)
    and a "Not available in sandbox" list (webhooks is the only one stated).
28. 🔴 `[api]` **Invoice creation requires a read-write token bound to an IP
    allowlist** (Invoicing guide, "API Token Scopes"). Same serverless problem
    as direct sends — but invoices don't move money. There is no
    `request-invoice` analog. **Ship:** drop the allowlist for AR writes, or
    add them to the no-allowlist Custom scopes.
29. 🟠 `[api]` **No Bill Pay / accounts-payable API.** The Invoicing API is
    receivables only. Payables exist in the product (Bill Pay) but an agent
    can't list bills due, so AP has to be modeled outside Mercury. **Ship:**
    `GET /bills` (due date, vendor, amount, status) + `request-send-money`
    accepting a `billId`.
30. 🟡 `[api]` **No API for invoice reminders.** Overdue-invoice follow-up is a
    dashboard action; an agent can draft the message but not send it through
    Mercury. **Ship:** `POST /invoice/{id}/remind`.
31. 🟡 `[cli]` **No `--sandbox` flag on the official CLI.** `--base-url` exists;
    whether sandbox tokens + sandbox base URL work end-to-end is unverified.
    **Ship:** `MERCURY_ENV=sandbox` / `--sandbox`, and detect `mercury_sandbox_`
    token prefixes automatically (the prefix already encodes the environment).
32. 🔴 `[ecosystem]` **Grok's connector client is `tools/list` + `tools/call`
    only** — an elicitation makes the call time out. Together with Claude.ai
    and ChatGPT, none of the three consumer chat surfaces can render an
    approval today.

## Found while building (2026-09-15)

33. 🟡 `[api]` `[docs]` **Resource paths are inconsistent.** Receivables live at
    `/ar/invoices` and `/ar/customers`; everything else is top-level
    (`/recipients`, `/treasury`). The approval-queue transfer is
    `POST /request-transfer`, but its docs title is "Request to transfer money"
    and its payment sibling is `/account/{id}/request-send-money` — one is
    account-scoped, one isn't. An agent reading titles guesses wrong. **Ship:**
    a path table in Getting Started; consider aliases.
34. 🟠 `[api]` **No typed client and no spec to generate one from.** We
    hand-typed ~15 objects from per-page OpenAPI fragments. A published
    `openapi.json` would have made this `openapi-typescript` in one command.
    (Restates item 2 from the builder's seat.)
35. 🟡 `[api]` **`Account.kind` is a free-form string.** The enum that clearly
    exists server-side (checking/savings/treasury/credit…) isn't in the spec,
    so filtering "operating accounts" means string-matching. **Ship:** enum it.
36. 🟡 `[mcp]` `[ecosystem]` **MCP 2026-07-28 capability detection is
    per-request.** `_meta["io.modelcontextprotocol/clientCapabilities"]` must be
    read on every call to decide whether elicitation is renderable; the SDK
    backfills `getClientCapabilities()` from it. Any bank-grade MCP server that
    wants to gate on this needs the same branch we wrote — worth a paragraph in
    Mercury's "Build your own client" guide when they add writes.
37. 🔴 `[mcp]` `[ecosystem]` **Stateless servers can't see 2025-era clients'
    capabilities.** Verified with the official TypeScript client SDK v2: by
    default it speaks 2025-11-25 — capabilities are declared once in
    `initialize` and never again. A stateless Streamable HTTP server (Vercel,
    one fresh server per request) has forgotten them by `tools/call`, so
    `getClientCapabilities()` is `undefined` and there is no `_meta` envelope.
    Only 2026-07-28 clients (per-request envelope) can be capability-gated.
    Our server treats "unknown" as "can't render" and returns the approve URL,
    which is the safe default — but it means **every 2025-era client gets the
    URL path even if it could have shown a form.** Any bank that ships a
    hosted, stateless, write-capable MCP will hit this. **Ship (Mercury MCP
    docs):** state the protocol version the server speaks and that
    2025-era clients are served statelessly; recommend clients upgrade.
38. 🟠 `[sandbox]` **The sandbox enforces the production IP-allowlist rule.**
    Creating a Read and Write token in the sandbox demands an IP whitelist,
    same as production, even though no real money exists. A builder on a
    laptop (or a plane) can't get a write token for *testing*. The Custom
    token path (`RequestSendMoney` + reads, no asterisk) should work — verify.
    **Ship:** relax the allowlist for sandbox tokens, or at least say in the
    sandbox guide which token type to create.
39. 🔴 `[api]` `[docs]` `[sandbox]` **"Send Money with Approval" requires an IP
    allowlist — contradicting the docs.** API Token Security Policies says the
    request-send-money endpoint is usable "without IP whitelisting" via a
    Custom token whose scopes have no asterisk. In the sandbox token dialog the
    scope has no asterisk and the whitelist is still mandatory. Consequences:
    the one write path that is supposed to work from serverless hosts doesn't
    (at least in sandbox); a Vercel-hosted agent can read but never queue.
    **Ship:** make the docs and the dialog agree; if the approval path truly
    needs an allowlist, say so and offer a static-egress guide — or drop it,
    since dashboard approval is the control.
40. 🟡 `[docs]` **Scope names in the docs don't match the picker.** Docs:
    `RequestSendMoney`. Picker: "Send Money with Approval". Search is
    substring-on-display-name, so "request" doesn't find it. The asterisk is
    the only allowlist signal and is unexplained in the dialog.
    **Ship:** a scope catalog with both the display name and the identifier.
41. 🔴 `[api]` **No Custom-token scope for `request-transfer`.** "Send Money
    with Approval" exists; "Transfer with Approval" does not. The approval-
    gated internal transfer — the safest money movement in the API — can't be
    granted without a full Read and Write token (allowlisted). Steward's
    treasury sweep therefore stops at "proposed" under a Custom token.
    **Ship:** a `Transfer with Approval` scope, allowlist-free.
42. 🔴 `[api]` **"Update Transactions" requires an IP allowlist.** Adding a
    note or category moves no money and is the write Mercury's own launch
    coverage says early users want most ("transaction cleanup"). Allowlisting
    it rules out every hosted agent. **Ship:** drop the asterisk on
    non-monetary writes (transactions, invoices, categories).
43. 🟡 `[docs]` The Custom scope picker *is* the scope catalog — 27 scopes,
    seven groups, asterisk convention, one "Experimental" badge — and it lives
    only in a modal. Transcribed to `docs/scope-catalog.md`; Mercury should
    publish the equivalent with identifiers and endpoint mappings.
