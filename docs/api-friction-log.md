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
44. 🟠 `[api]` `[sandbox]` `[docs]` **IP allowlists are IPv4-in-practice on a
    dual-stack API.** `api-sandbox.mercury.com` publishes AAAA records
    (Cloudflare), so a Mac on a home/mobile ISP egresses over IPv6 — a
    temporary SLAAC address that rotates. The dashboard hint and `ifconfig.me`
    both nudge you to allowlist IPv4; curl and Node `fetch` then connect over
    IPv6 and get `401 ipNotWhitelisted`. The error body does echo the observed
    IP (good), but nothing says "you're on IPv6; allowlist a /64 or force
    IPv4." Workaround: `curl -4`, `NODE_OPTIONS=--dns-result-order=ipv4first`.
    **Ship:** accept IPv6 prefixes (/64) in the allowlist, and add an
    `ipFamily` hint to the `ipNotWhitelisted` error.

## Sandbox recon (2026-09-16) — ranked by expected impact

Probed read-only with a Custom token; evidence in `sandbox-surface.md`,
reproducible via `scripts/recon/sweep.mjs`. Ordered most → least impact.

45. 🔴 `[sandbox]` **The seed org can't rehearse an agent, and you can't seed it
    without allowlisted scopes.** 0 invoices, 0 customers, 0 treasury, 0
    statements, 0 approval requests. 79 recipients, but 71 are "Currency Cloud
    Recipient N" international wires, 3 are "Banned Recipient" (all `active`),
    4 are ACH, none look like a vendor. Running Steward's real `closeMonth`
    against it: 0 AR follow-ups, 0 payments, 3 unmatched bills, and one $1.44M
    sweep that can't be queued (#41). Creating recipients, customers, and
    invoices needs asterisked scopes (#28, `scope-catalog.md`), so a builder
    on a laptop with the recommended propose-only token can't fix the data.
    Mercury's most ambitious API customers are building exactly these
    workflows (close, AP, AR, treasury) and have nothing to test them on.
    **Ship:** selectable seed profiles at sandbox creation ("seed-stage SaaS,
    month 18": vendors with ACH details, customers, overdue invoices, a
    treasury account, statements, pending approvals) and a one-click reset.
46. 🔴 `[api]` **Unknown and malformed query params are silently ignored.**
    `postedstart=` (case typo of `postedStart`) returns all 150 rows unfiltered
    with 200; `order=newest` returns 200 in `asc`. But `status=bogus` and
    `start=yesterday` 400. An LLM that half-remembers a param name gets
    *plausible, wrong* data and no signal — the worst failure mode for an
    agent doing accounting. **Ship:** 400 on unknown params and invalid enums
    (`code: unknown_parameter`, `hint: "did you mean postedStart?"`), behind an
    API version if needed.
47. 🟠 `[api]` `[docs]` `[sandbox]` **`start`/`end` filter `createdAt`; the
    dashboard shows `postedAt`.** Documented in the param description, but the
    obvious names are the wrong ones for any period-based task (month-end
    close, spend by month). In the sandbox the gap is extreme: every
    `createdAt` is the seed run (Aug 16–Sep 15) while `postedAt` spans Apr–Sep,
    82 rows are posted *before* they were created, and `end=2026-06-30`
    returns 0 rows though 16 posted before then. Steward's own `closeMonth`
    fell into this (uses `start` and `createdAt` for the outflow window).
    **Ship:** `createdStart`/`createdEnd` aliases and deprecate the bare names;
    seed `createdAt` consistently with `postedAt`.
48. 🟠 `[sandbox]` **No categorization or merchant data to build against.**
    `mercuryCategory` 0/150, `categoryData` 0/150, `generalLedgerCodeName`
    0/150; `merchant` on 3 rows, all with placeholder id `1234567890`; MCC on 2
    (both 6011, ATM). 23 categories exist and none are applied. Spend,
    subscription, and cleanup agents (#14, #19, #20) are untestable.
    **Ship:** seed real MCCs, merchant ids, and categories on card spend.
49. 🟠 `[api]` **The credit account is invisible to `/accounts` but a third of
    `/transactions` belongs to it.** 49 of 150 rows carry an `accountId` that
    `/accounts` doesn't list and `GET /account/{id}` 404s on; you have to know
    to join `/credit`. `GET /account/{creditId}/transactions` *does* work. An
    agent grouping spend by account gets an unknown bucket or crashes on a
    lookup. **Ship:** list credit in `/accounts` with `kind: "credit"`, or put
    `accountKind` on each transaction.
50. 🟠 `[api]` **Transfer approval requests are write-only.** `POST
    /request-transfer` exists; there is no documented `GET /request-transfer`
    or `GET /request-transfer/{id}` (both 403 `tokenNotInScope`, not 404/405).
    `request-send-money` has list + get + status filter. An agent that queued
    a sweep can never check whether it was approved (compounds #22, #41).
    **Ship:** list/get for transfer requests with the same status enum, and
    return 405 for wrong methods.
51. 🟠 `[api]` **Four error envelopes and two list envelopes.** Observed:
    `{errors:{errorCode,message}}` (403 scope, 400 date),
    `{errors:{errorCode:"resourceNotFound",message}}` (`/account/{id}`),
    `{errors:{notFound:[…"contact help@mercury.com"]}}` (no code;
    `/transaction/{id}`, unknown paths, and malformed UUIDs, which should be
    400), `{errors:{message}}` (limit > 1000, no code). `tokenNotInScope`
    doesn't name the missing scope. Lists: org-scoped transactions return
    `{transactions, page}`; account-scoped return `{total, transactions}` with
    no cursor. Evidence for #10 and #12. **Ship:** one problem+json shape with
    `code`, and `requiredScope` on 403.
52. 🟠 `[api]` `[mcp]` **Transactions are heavy for a context window.** 1.2 KB
    per row in a list (4.4 KB from `GET /transaction/{id}`); 10 of 35 top-level
    keys were null on all 150 rows. 150 rows ≈ 182 KB ≈ 45k tokens; 79
    recipients ≈ 60 KB. **Ship:** `fields=` sparse fieldsets and an
    omit-nulls option; the MCP should use both by default (see #15).
53. 🟡 `[api]` **Zero-date sentinel instead of null.** `postedAt`,
    `failedAt`, and `recipient.dateLastPaid` use `0001-01-01T00:00:00Z`, on
    `sent` transactions too. Sorts first, parses as a valid date, breaks
    "days since last paid." **Ship:** null.
54. 🟡 `[api]` **Headers: no rate-limit info; internal metadata instead.**
    Confirms #11 in practice — no `RateLimit-*` / `Retry-After`. Good:
    `x-mercury-request-id` and `traceparent`. But every API response also
    carries `git-commit`, `ecs-task-name`, `ecs-task-id`,
    `mercury-honeycomb-link`, and four `Set-Cookie`s (incl. a `_SESSION`) on
    bearer-token calls, which cookie-jar HTTP clients will persist.
    **Ship:** rate-limit headers; strip deploy metadata and cookies from the
    API host.
55. 🟡 `[sandbox]` **Account nicknames carry the wrong last four.** Checking
    ••6579 is nicknamed "Evolve Checking ••4124"; ••1047 is "Mercury Checking
    ••5234". Steward proposed a sweep "from Evolve Checking ••4124", which
    the user can't find. Since account numbers are (rightly) redacted, the
    name is the only human handle. **Ship:** fix seeds; add
    `accountNumberLast4` as a first-class field.
56. 🟡 `[sandbox]` **The sandbox writes the developer's real email into
    seeded transaction data** (`details.creditCardInfo.email`, all 32 credit-
    card rows). Sandbox payloads end up in fixtures, screenshots, LLM
    contexts, and bug reports. **Ship:** seed a placeholder address.
57. 🟡 `[docs]` **`GET /account/{id}` works but isn't in the API reference.**
    Neither `llms.txt` nor any reference page lists it (only
    `/account/{id}/transactions`, `/cards`, `/statements`, and the
    request-send-money POST). Agents that only trust the spec won't use it.

## Write tests (2026-09-16) — ranked by expected impact

`request-send-money` / `request-transfer` from the propose-only Custom token,
directly and through Steward's MCP (elicitation accepted → `queueProposal`).

58. 🔴 `[api]` `[docs]` **The approval queue needs a second human. A solo
    founder can't propose anything.** `POST /account/{id}/request-send-money`
    ($12.34 ACH to a seeded ACH recipient) → `400 {"errors":{"invalidApproval":
    ["Nobody else in this organization can approve this payment, so it can't
    be submitted for approval."]}}`. The sandbox org has one user, so the
    token's owner is the only possible approver and self-approval isn't
    allowed. The API reference says only "will require approval based on your
    organization's approval policies"; nothing says a single-member org is
    rejected outright. Consequences: the one write path documented as safe
    for agents (#8, #39) is unavailable to the smallest companies, who are
    exactly who wants an agent to do the close; and gate 2 can't be tested in
    a default sandbox at all. Through Steward the user *approves in chat
    (gate 1), then gets a raw 400* — the worst place to learn it. **Ship:**
    let the requester approve their own agent-originated request in the
    dashboard (the dashboard step with 2FA is the control, not a second
    person); document the rule on the endpoint; add a
    `GET /organization/approval-policy` so an agent can check *before* asking
    the human; seed sandbox orgs with a second approver.
59. 🟠 `[api]` **A fifth error envelope, and validation runs before
    idempotency.** `invalidApproval` is `{errors:{<name>:[message]}}` with no
    `errorCode` (cf. #51). Repeating the request with the same
    `idempotencyKey` but a different amount returns the same 400, so whether
    the key is honored (or conflicts are detected) can't be observed until a
    request succeeds. **Ship:** `code: approver_unavailable`; document
    idempotency-key conflict behavior (409 on same key, different body).
60. 🟡 `[api]` **`request-transfer` fails with a scope error, not a
    capability error.** 403 `tokenNotInScope` (expected, #41) — confirmed live.
    Even if a scope existed, #58 would likely reject it too; there's no way
    to tell from the API which will fire first.
