# Findings — ranked

Executive summary of `api-friction-log.md` (68 items as of 2026-09-16) and the
recommendations that fall out of building Steward. Numbers in brackets point
at log entries. Ranking weighs: does it *block* an agent or just cost it;
how many builders hit it; how cheap the fix is; and whether it advances what
Mercury is already doing (Command, MCP, CLI, agent cards).

## BLUF

**Mercury's API is agent-readable but not agent-actionable.** The right
primitive already exists — queue an action for human approval — but it is
(a) not exposed to agents (the MCP is read-only), (b) inconsistent about the
IP allowlist that makes serverless hosting impossible, (c) **unavailable to
any org with one member**, because the requester can't be the approver [58],
and (d) unsafe to retry: an idempotency key replayed with the same body
returns a 400, not the original request [59]. Fix those and the MCP can ship
writes safely.

The API also fails *silently* on exactly the mistakes models make:
misspelled filters are ignored and return unfiltered data, and `start`/`end`
quietly mean `createdAt` [46, 47]. Sandbox and docs issues are real but
secondary; they're listed below the line.

## Top five, in order

### 1. Ship a **propose** tier: the approval-queue endpoints, exposed to agents, with no IP allowlist, usable by a solo founder, safe to retry  [58, 59, 8, 14, 39, 41, 42, 6]
`request-send-money` and `request-transfer` are the agent-safe writes: a
human in the dashboard is the control, so the allowlist is redundant. Today
they're absent from the MCP, and in the sandbox the approval scope still
demands an allowlist despite the docs saying otherwise. Make "Send Money with
Approval" + a new "Transfer with Approval" (there is none today, #41) +
`updateTransaction` (note/category — allowlisted today, #42) a
first-class scope tier for both API tokens and MCP OAuth, allowlist-free, and
say so in the token dialog. And let the requester approve their own
agent-originated request in the dashboard: today a one-person company gets
`400 invalidApproval` ("Nobody else in this organization can approve this
payment"), so the smallest customers, the ones who most want an agent doing
the close, can't queue anything (#58). The dashboard step with 2FA is the
control; a second person is a policy choice, not a safety requirement.
Expose the policy (`GET /organization/approval-policy`) so an agent can check
before it asks the human to approve. Make retries safe: same idempotency
key + same body should return the original request, not a 400 (#59), or an
agent that times out will either abandon a real request or queue a
duplicate. **This is the single change that turns Command's
"propose, then approve" model into something third-party agents can use.**
Effort: M. Unlocks: everything below.

### 2. Decide what serverless agents are allowed to do  [8, 28, 38, 39]
Vercel, Workers, Lambda, and every hosted agent runtime have no fixed egress
IP. Today that means: reads only, no invoice creation, no queued payments
(per #39). Either (a) drop the allowlist for approval-gated and non-monetary
writes, or (b) publish a static-egress guide and a sandbox exemption. Pick one
and document it on the token page. Effort: S (docs) / M (policy).

### 3. Make the API legible to a model — and loud when it's misused  [46, 47, 2, 6, 10, 51, 59, 49, 11, 33, 35]
First, fail loudly: 400 on unknown query params and invalid enums instead of
returning unfiltered data (`postedstart=` and `order=newest` both 200 today,
#46), and rename `start`/`end` to say they filter `createdAt` (#47). Those two
turn "plausible but wrong" answers into self-correcting errors. Then: one
`openapi.json` (today: per-page fragments with the whole schema tree
inlined, 200 KB of duplicate JSON for five pages); a scope catalog mapping
each operation to its scope identifier *and* display name, plus whether it
needs an allowlist; one problem+json error shape (five envelopes observed,
`tokenNotInScope` doesn't name the scope, #51); published rate limits and
rate-limit headers; enum `Account.kind` and list credit in `/accounts` (a
third of sandbox transactions belong to an account `/accounts` omits, #49);
a path table for the `/ar/*` and `/request-*` outliers. Mostly spec work.
Effort: S–M. Highest leverage per hour of anything here.

### 4. Close the approval loop from any client  [64, 63, 66, 25, 22, 50, 37]
Consumer chat clients (Claude.ai, ChatGPT, Grok) can't render an MCP
approval prompt; only developer clients can, and stateless servers can't even
detect 2025-era clients' capabilities. So the *dashboard* has to be reachable
by URL from a tool result: add `dashboardLink` to approval-request responses
(accounts and transactions already have one) and emit
`approvalRequest.updated` events so an agent learns the outcome. Transfer
requests also need a `GET` at all: today an agent that queues a sweep can
never read its status (#50). `request-send-money` already returns
`requesterMayApprove` and `numberOfApproversRequired`, which is the right
shape; add `dashboardLink` beside them. The page already exists
(`/payments/approvals?requestId=…`) and isn't under Tasks, so without the
link the approver goes hunting (#64). And make the API's view of the queue
match the dashboard's: a $100 request waiting there is invisible to
`GET /request-send-money`, so an agent can't count what's already committed
(#63). Approval outcomes emit no event today; the only signal is a new
transaction whose `requestId` points back (#66). Effort: S–M.

### 5. Serve the aggregates and fill the data gaps  [15, 19, 20, 29, 52]
A hosted MCP should answer "spend by category, 90 days" and "recurring
streams" server-side instead of paging transactions into context (150 rows ≈
182 KB ≈ 45k tokens, #52); Mercury already computes these for the dashboard.
Add sparse fieldsets for everything else. Payables (`GET /bills`) and merchant
lookup (`GET /merchant/{id}`) are the two missing nouns. Effort: M–L.

## Everything else, by tier

**Tier A — cheap, do this quarter**
- `--sandbox` flag / auto-detect `mercury_sandbox_` prefix in the CLI [31]
- Protocol version + capabilities stated on the MCP docs page [26]
- Fix the OpenAPI `info.description` boilerplate; put the official MCP URL on `docs/welcome` [4, 5]
- Normalize the two "Get transaction by ID" titles in `llms.txt` [3]
- Distinct 409 for the 24-hour duplicate-payment guard [13]
- Token-downgrade error code + `GET /token/self` [9]
- `null` instead of the `0001-01-01T00:00:00Z` sentinel [53]
- Rate-limit headers; strip `git-commit` / ECS / Honeycomb headers and session cookies from the API host [54]
- Accept IPv6 /64s in allowlists, or say they're IPv4-only in the error [44]

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
Not-Available tables; DCR + PKCE on the MCP with the reserved `Mercury` client
name; deterministic cursor pagination on org-scoped lists; `dashboardLink` on
accounts and transactions; `x-mercury-request-id` + `traceparent` on every
response; strict validation of dates and transaction status (the model to
extend to every param); on approval requests, `requesterMayApprove`,
`numberOfApproversRequired`, and `reviews[]` with reviewer and timestamp;
`requestId` on the resulting transaction, which closes the audit trail.

## What Steward proves

Built on the API as it exists: read → analyze → propose → approve in the
client → approve in Mercury. Two gates, no direct sends, no production token.
Every item in the top five was hit while building it, which is the argument
for the ranking: these aren't hypothetical, they're the order a real
integrator trips over them.
