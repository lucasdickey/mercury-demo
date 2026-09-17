# Findings — ranked

Executive summary of `api-friction-log.md` (75 items as of 2026-09-16) and the
recommendations that fall out of building Steward. Numbers in brackets point
at log entries. Ranking weighs: does it *block* an agent or just cost it;
how many builders hit it; how cheap the fix is; and whether it advances what
Mercury is already doing (Command, MCP, CLI, agent cards). "Live" means we
reproduced it against the sandbox API, dashboard, CLI, or MCP.

## BLUF

**Mercury's API is agent-readable but not agent-actionable.** The right
primitive already exists — queue an action for human approval — but it is
(a) not exposed to agents in production (the MCP is read-only), (b) blocked by
an IP allowlist that hosted agents can't satisfy, (c) **unavailable to any org
with one member**, because the requester can't be the approver [58], and (d)
unsafe to retry: an idempotency key replayed with the same body returns a
400, not the original request [59].

Mercury appears to be building the fix: an undocumented sandbox MCP host
advertises `transactions:request` and `transfers:request` scopes [18]. The
list below is what a builder hits on the way there, in the order Steward hit
it. The API also fails *silently* on exactly the mistakes models make:
misspelled filters return unfiltered data, and `start`/`end` quietly mean
`createdAt` [46, 47]. Sandbox and docs issues are real but secondary; they're
below the line.

## Top ten, in order

### 1. Let agents propose writes: a scope tier for MCP and API tokens, no IP allowlist  [8, 14, 18, 39, 41, 42, 68] · live
`request-send-money` and `request-transfer` are the agent-safe writes: a human
in the dashboard is the control, so the allowlist is redundant. Today they're
absent from the production MCP; in the sandbox the approval scope still demands
an allowlist despite the docs; there's no token scope for transfer requests at
all (#41); and note/category updates are allowlisted (#42). The CLI mirrors the
gap: it has no transfer-request command, and `payments transfer` (a direct
transfer) sits next to `payments request` (#68). The sandbox MCP's scopes show
the shape; ship it to production and to API tokens, allowlist-free, and name
direct movers so no agent picks one by mistake. **This is the change that turns
Command's "propose, then approve" into something third-party agents can use.**
Effort: M.

### 2. Make approvals usable by a one-person company  [58] · live
With one org member, `request-send-money` returns `400 invalidApproval`
("Nobody else in this organization can approve this payment"). The smallest
customers, the ones who most want an agent doing the close, can't queue
anything. Let the requester approve their own agent-originated request in the
dashboard (the 2FA'd approval step is the control; a second person is a policy
choice), and expose the policy (`GET /organization/approval-policy` or a dry
run) so an agent can check before asking the human. Effort: S–M.

### 3. Make retries safe  [59, 74, 13] · live
Same idempotency key + same body → 400 "already used", not the original
request; a different body gets the same error, so replay and conflict look
identical. An agent that times out either abandons a real request or mints a
new key and queues a duplicate. Only 4 of 12 write endpoints accept a key at
all (#74). Ship Stripe semantics (replay → original 200; conflict → 409) on
every POST. Effort: M.

### 4. Fail loudly  [46, 47] · live
400 on unknown query params and invalid enums instead of returning unfiltered
data (`postedstart=` and `order=newest` both 200 today), with a
`did_you_mean` hint; the CLI already does this for flags (#72). Rename
`start`/`end`, which filter `createdAt` while the dashboard shows `postedAt`.
Those two turn plausible-but-wrong answers into self-correcting errors.
Effort: S.

### 5. Close the approval loop  [64, 63, 66, 22, 50, 25] · live
Add `dashboardLink` to approval requests (the page exists,
`/payments/approvals?requestId=…`, and isn't under Tasks, #64); make the API's
view of the queue match the dashboard's (a $100 request there is invisible to
`GET /request-send-money`, #63); emit approval events (today the only signal is
a new transaction whose `requestId` points back, #66); and give transfer
requests a `GET` (#50). Consumer chat clients can't render an MCP approval
prompt (#25), so the link is how any client completes the loop. Effort: S–M.

### 6. Decide what hosted agents may do  [28, 39, 44, 70] · live
Vercel, Workers, Lambda, and every hosted agent runtime have no fixed egress IP,
so today they get reads only. Drop the allowlist for approval-gated and
non-money writes, or publish a static-egress guide. Either way, accept IPv6: an
IPv4-allowlisted token fails from a dual-stack laptop, and the official CLI has
no way to force IPv4 (#44, #70). Effort: S (docs) / M (policy).

### 7. Make the spec legible to a model  [2, 6, 10, 51, 34, 11] · docs + live
One `openapi.json` (today: per-page fragments, 200 KB of duplicated schema for
five pages) with each operation's scope and whether it needs an allowlist; one
error shape (five envelopes observed) with `requiredScope` on 403; published
rate limits. Effort: S–M. Highest leverage per hour.

### 8. Fix the account model  [49, 35] · live
The credit account is missing from `/accounts` and `GET /account/{id}` 404s on
it, yet a third of sandbox transactions belong to it. `Account.kind` is a free
string. Effort: S.

### 9. Serve aggregates and trim payloads  [15, 52, 19] · live (size)
150 transactions ≈ 182 KB ≈ 45k tokens, with 10 of 35 fields always null. Serve
"spend by category" and recurring streams server-side (the dashboard already
computes them) and add sparse fieldsets. Effort: M–L.

### 10. Add the missing nouns  [29, 20] · docs
Payables (`GET /bills`; Bill Pay exists in the product) and merchant lookup
(`GET /merchant/{id}`). Steward had to keep its bills list outside Mercury.
Effort: M.

## Everything else, by tier

**Tier A — cheap, do this quarter**
- Discovery points at the right server: the docs' MCP server card lists only `docs.mercury.com/mcp`; `api-catalog` and `llms-full.txt` 404 [73, 1]
- Task-level agent skills (start with "request a payment for approval") in place of the placeholder skills index [75]
- CLI: errors on stderr, not stdout after "No results." [69]; redaction option for account numbers [71]
- Protocol version + capabilities stated on the MCP docs page; document the sandbox MCP host [26, 18]
- Fix the OpenAPI `info.description` boilerplate; put the official MCP URL on `docs/welcome` [4, 5]
- Normalize the two "Get transaction by ID" titles in `llms.txt` [3]
- Token-downgrade error code + `GET /token/self` [9]
- `null` instead of the `0001-01-01T00:00:00Z` sentinel [53]
- Rate-limit headers; strip `git-commit` / ECS / Honeycomb headers and session cookies from the API host [54]

**Tier B — product**
- Agent cards creatable via API; funding guide for x402 / ACP / AP2 / MPP [21]
- Invoice reminder endpoint [30]
- Personal-account endpoint matrix [23]
- MCP prompts/resources and tool-selection guidance [16]

**Tier C — ecosystem, not Mercury's to fix, but shapes the roadmap**
- Consumer clients don't render elicitation [25]; Grok times out on it [32]
- MCP 2026-07-28 moved elicitation to stateless MRTR; sampling/roots deprecated [26, 36, 37]
- OAuth metadata gaps in Mercury's own MCP (401 without `resource_metadata`, PRM only at root) [17]

**⬇ Below the line — sandbox and docs (flag, don't lead)**
- Richer sandbox seed data for close/AP/AR/treasury, plus categories and MCCs [45, 48, 27]
- Sandbox test helper to approve/reject a queued request by API, so gate 2 is testable without a second real user and 2FA [62, 61]
- Sandbox allowlist relaxed for test tokens [38]
- Scope catalog published; token dialog and docs agree on names and the asterisk rule [43, 40]
- Minor: seeded nicknames with wrong last four, signup email in seed data, `GET /account/{id}` undocumented, approvals missing from Tasks; dashboard Approve button ignores accessibility clicks [55, 56, 57, 65, 67]

**Things that are good and should stay**
`llms.txt` + `.md` suffix; the Send Money guide's Supported / Client-Side /
Not-Available tables; DCR + PKCE on the MCP; deterministic cursor pagination on
org-scoped lists; `dashboardLink` on accounts and transactions;
`x-mercury-request-id` + `traceparent` on every response; strict validation of
dates and transaction status (the model to extend to every param); on approval
requests, `requesterMayApprove`, `numberOfApproversRequired`, and `reviews[]`
with reviewer and timestamp; `requestId` on the resulting transaction, which
closes the audit trail. In the CLI: `--environment sandbox`, required
idempotency keys, `--yes` required when non-interactive, and "did you mean"
on mistyped flags [72].

## What Steward proves

Built on the API as it exists: read → analyze → propose → approve in the
client → approve in Mercury. Two gates, no direct sends, no production token.
Every item in the top ten was hit while building it, which is the argument
for the ranking: these aren't hypothetical, they're the order a real
integrator trips over them.
