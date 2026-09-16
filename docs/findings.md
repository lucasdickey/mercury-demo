# Findings — ranked

Executive summary of `api-friction-log.md` (43 items as of 2026-09-16) and the
recommendations that fall out of building Steward. Numbers in brackets point
at log entries. Ranking weighs: does it *block* an agent or just cost it;
how many builders hit it; how cheap the fix is; and whether it advances what
Mercury is already doing (Command, MCP, CLI, agent cards).

## BLUF

**Mercury's API is agent-readable but not agent-actionable.** The right
primitive already exists — queue an action for human approval — but it is
(a) not exposed to agents (the MCP is read-only), (b) inconsistent about the
IP allowlist that makes serverless hosting impossible, and (c) undiscoverable
(scopes, paths, and errors aren't legible to a model). Fix those three and the
MCP can ship writes safely. Everything else is polish.

## Top five, in order

### 1. Ship a **propose** tier: the approval-queue endpoints, exposed to agents, with no IP allowlist  [8, 14, 39, 41, 42, 6]
`request-send-money` and `request-transfer` are the agent-safe writes: a
human in the dashboard is the control, so the allowlist is redundant. Today
they're absent from the MCP, and in the sandbox the approval scope still
demands an allowlist despite the docs saying otherwise. Make "Send Money with
Approval" + a new "Transfer with Approval" (there is none today, #41) +
`updateTransaction` (note/category — allowlisted today, #42) a
first-class scope tier for both API tokens and MCP OAuth, allowlist-free, and
say so in the token dialog. **This is the single change that turns Command's
"propose, then approve" model into something third-party agents can use.**
Effort: M. Unlocks: everything below.

### 2. Decide what serverless agents are allowed to do  [8, 28, 38, 39]
Vercel, Workers, Lambda, and every hosted agent runtime have no fixed egress
IP. Today that means: reads only, no invoice creation, no queued payments
(per #39). Either (a) drop the allowlist for approval-gated and non-monetary
writes, or (b) publish a static-egress guide and a sandbox exemption. Pick one
and document it on the token page. Effort: S (docs) / M (policy).

### 3. Make the API legible to a model  [2, 6, 10, 11, 33, 35, 40, 43]
One `openapi.json` (today: per-page fragments with the whole schema tree
inlined, 200 KB of duplicate JSON for five pages); a scope catalog mapping
each operation to its scope identifier *and* display name, plus whether it
needs an allowlist; RFC 9457 error bodies instead of prose; published rate
limits; enum `Account.kind`; a path table for the `/ar/*` and
`/request-*` outliers. All docs-and-spec work. Effort: S–M. Highest
leverage per hour of anything here.

### 4. Close the approval loop from any client  [25, 22, 37]
Consumer chat clients (Claude.ai, ChatGPT, Grok) can't render an MCP
approval prompt; only developer clients can, and stateless servers can't even
detect 2025-era clients' capabilities. So the *dashboard* has to be reachable
by URL from a tool result: add `dashboardLink` to approval-request responses
(accounts and transactions already have one) and emit
`approvalRequest.updated` events so an agent learns the outcome. Effort: S.

### 5. Serve the aggregates and fill the data gaps  [15, 19, 20, 29, 27]
A hosted MCP should answer "spend by category, 90 days" and "recurring
streams" server-side rather than paging 1,000 rows into context; Mercury
already computes these for the dashboard. Payables (`GET /bills`) and
merchant lookup (`GET /merchant/{id}`) are the two missing nouns. And the
sandbox guide should say what's seeded and what isn't. Effort: M–L.

## Everything else, by tier

**Tier A — cheap, do this quarter**
- Token dialog and docs agree on scope names and the asterisk rule [40]
- `--sandbox` flag / auto-detect `mercury_sandbox_` prefix in the CLI [31]
- Protocol version + capabilities stated on the MCP docs page [26]
- Fix the OpenAPI `info.description` boilerplate; put the official MCP URL on `docs/welcome` [4, 5]
- Normalize the two "Get transaction by ID" titles in `llms.txt` [3]
- Distinct 409 for the 24-hour duplicate-payment guard [13]
- Token-downgrade error code + `GET /token/self` [9]

**Tier B — product**
- Agent cards creatable via API; funding guide for x402 / ACP / AP2 / MPP [21]
- Invoice reminder endpoint [30]
- Personal-account endpoint matrix [23]
- MCP prompts/resources and tool-selection guidance [16]

**Tier C — ecosystem, not Mercury's to fix, but shapes the roadmap**
- Consumer clients don't render elicitation [25]; Grok times out on it [32]
- MCP 2026-07-28 moved elicitation to stateless MRTR; sampling/roots deprecated [26, 36, 37]
- OAuth metadata gaps in Mercury's own MCP (401 without `resource_metadata`, PRM only at root) [17]

**Things that are good and should stay**
`llms.txt` + `.md` suffix; the Send Money guide's Supported / Client-Side /
Not-Available tables; DCR + PKCE on the MCP with the reserved `Mercury` client
name; deterministic cursor pagination everywhere; `dashboardLink` on accounts
and transactions.

## What Steward proves

Built on the API as it exists: read → analyze → propose → approve in the
client → approve in Mercury. Two gates, no direct sends, no production token.
Every item in the top five was hit while building it, which is the argument
for the ranking: these aren't hypothetical, they're the order a real
integrator trips over them.
