# Steward — execution plan

Hand-off document. Written 2026-09-15 for whichever model/agents execute the
build. Read `CLAUDE.md`, `docs/direction.md`, `docs/landscape.md`, and
`docs/api-friction-log.md` first; this file is the *what to do*, those are the
*why*.

## 0. Decisions already made (do not relitigate)

| Decision | Choice |
|---|---|
| Concept | **Steward** — propose-only agent tier on Mercury. Read → analyze → propose → approve in chat (MCP elicitation) → approve in Mercury (approval-queue endpoints). |
| Capabilities | (1) recurring-spend audit, (2) idle-cash sweep, (3) pay a saved recipient. |
| Hosting | Vercel, one Next.js app. MCP at `/api/mcp/[secret]`, chat UI at `/`, docs at `/docs`. |
| Data | Personal **read-only** production token for reads. **Sandbox** write token for anything that writes. Never a read-write production token anywhere. |
| MCP auth | Approach 1: long random path segment + server-side check. Real OAuth is a "what's next" slide, not built. |
| Clients to demo | Claude.ai custom connector and/or ChatGPT Developer Mode (surfaces we don't own) + our own web chat (surface we own) + CLI pipe. |
| Model | Claude via Vercel AI SDK. `claude-sonnet-5` default. |
| Presentation | `docs/index.html` (memo) + `docs/explainer.html` (Three.js walkthrough) already drafted. Remotion render is a stretch goal. |
| Timebox | Brief says ~2 h. We are past that on research; keep the build to MVP. Quality of thinking > polish. |

## 1. Preconditions (human)

- [ ] `.env.local` in repo root with `MERCURY_API_TOKEN=secret-token:mercury_production_…` (read-only). **As of writing, the file is not on disk** — first verify it exists.
- [ ] Sandbox account at https://sandbox.mercury.com/signup and a sandbox token → `MERCURY_SANDBOX_API_TOKEN`.
- [ ] `ANTHROPIC_API_KEY`.
- [ ] Vercel project linked (`vercel link`), env vars added for Production + Preview. Deployment Protection **off** for the MCP route (or the whole preview) so connector clients can reach it.

## 2. Step 1 — verify the personal-account surface (30 min, blocking)

Run against `https://api.mercury.com/api/v1` with the read-only token and record
status + a redacted sample for each. Put results in `docs/personal-account-surface.md`.

```
GET /accounts
GET /transactions?limit=50            # note: merchant.categoryCode present? mercuryCategory populated?
GET /categories
GET /merchants?limit=5
GET /recipients
GET /credit
GET /treasury
GET /organization
GET /users
GET /cards
GET /request-send-money               # list approval requests — does personal have the concept?
GET /events?limit=3
GET /webhooks
GET /customers, /invoices, /safes     # expect 403/404 on personal — that's a finding
```

Then against `https://api-sandbox.mercury.com/api/v1` with the sandbox token:
`POST /account/{id}/request-transfer-money` and `POST /account/{id}/request-send-money`
(dry: small amount, unique `idempotencyKey`) — confirm they 200 and appear in
the sandbox dashboard's approval queue. If **personal** lacks approval-queue
endpoints, note it: the demo still works because the sandbox is a business org,
and it becomes a friction-log entry ("personal accounts have no agent-safe write path").

Redact `accountNumber`, `routingNumber` in anything committed.

## 3. Repo layout

```
mercury-demo/
  PLAN.md  CLAUDE.md  .env.example
  docs/                      # served statically at /docs by the Next app
    index.html explainer.html direction.md landscape.md api-friction-log.md take-home-brief.md
  packages/core/             # framework-free TS
    src/mercury/client.ts    # fetch wrapper: base URL per env, bearer auth, cursor pagination, redaction
    src/mercury/types.ts     # Transaction, Account, Recipient (hand-typed from llms.txt fragments; no codegen)
    src/analyze/recurring.ts # streams: group by normalized counterparty+merchant.id, cadence, avg, last seen
    src/analyze/idle.ts      # floor = p10 of daily min balance over 60d (or user-set); idle = available - floor
    src/analyze/fees.ts      # kinds: wireFee, cardInternationalTransactionFee, personalBankingSubscriptionFee; FX feeAmount
    src/catalog/plans.json   # ~40 subscription merchants: name, match patterns, tiers[{name,price}], cancelUrl
    src/intents.ts           # zod: Proposal = downgrade | cancel | sweep | pay; {why, evidence[], requires_approval, reversible}
    src/steward.ts           # audit(), proposeSweep(), proposePayment() — pure, no HTTP framework
  apps/web/                  # Next.js (App Router)
    app/api/mcp/[secret]/route.ts   # mcp-handler; tools: audit_spend, propose_sweep, propose_payment, list_accounts
    app/api/chat/route.ts           # AI SDK streamText with the same tools via experimental_createMCPClient OR direct import
    app/page.tsx                    # chat UI; proposal cards; Approve/Decline buttons that call the same elicitation path
    app/docs/[[...path]]            # or next.config rewrite to /docs static
  apps/cli/                  # optional: `steward audit` reading jsonl from stdin (mercury CLI output)
```

pnpm workspaces. TypeScript strict. No ORM, no DB — stateless; proposals are
recomputed per request. Approval state lives in Mercury.

## 4. Work packages (parallelizable)

### A. `core` — Mercury client + analyzers
- Client: `MERCURY_ENV=production|sandbox` picks host; helper `listAllTransactions({start})` follows `page.nextPage`; strip `accountNumber`/`routingNumber` before returning anywhere.
- Recurring: normalize name (lowercase, strip digits/`*`/city suffixes), group by `merchant.id ?? normalizedName`; keep groups with ≥3 charges; cadence = median gap (weekly/monthly/annual within ±20 %); output `{merchant, cadence, avgAmount, lastAmount, lastSeen, count, category, mcc, evidence: txnIds}`.
- Catalog match: by pattern → tiers; proposal `downgrade` if current avg ≈ a higher tier and a lower tier exists; `cancel` if `lastSeen` > 2 cadences ago but still charged (zombie) — keep it simple.
- Idle cash: needs balances only; floor heuristic documented in code comment.
- Fees: sum by `kind`; FX via `currencyExchangeInfo.feeAmount`.
- Acceptance: `pnpm test` with fixtures built from redacted real rows; `steward.audit()` returns proposals in <2 s for 1,000 txns.

### B. `mcp` route
- Use `mcp-handler` (Vercel) on streamable HTTP. Path secret from `MCP_PATH_SECRET`; 404 on mismatch.
- Tools (zod-described, descriptions written for the model — say what they do *and* don't):
  - `list_accounts()` → redacted accounts + balances
  - `audit_spend({days?: 90})` → proposals
  - `propose_sweep({fromAccountId, toAccountId, amount})` → **elicitation** (`server.elicitInput`) → on accept, `POST …/request-transfer-money` on **sandbox** → return `{status:'pendingApproval', id, dashboardHint}`; on decline, return `{status:'declined'}`.
  - `propose_payment({recipientId, amount, memo})` → same pattern via `request-send-money`.
- If the connected client doesn't support elicitation (check client capabilities), return a proposal with `requires_client_confirmation: true` and instructions — do not fall back to executing.
- Acceptance: `npx @modelcontextprotocol/inspector` lists 4 tools; Claude.ai custom connector can call `audit_spend`; `propose_sweep` shows an Approve/Decline prompt in Claude; sandbox dashboard shows the queued transfer.

### C. Web chat
- AI SDK `useChat` + `streamText`; tools imported directly from `core` (don't loop back through our own MCP over HTTP).
- Proposal cards: kind stamp, amount, why, evidence count, Approve/Decline for `requires_approval` items. Approve calls a server action that runs the same sandbox `request-*` call.
- Show "queued in Mercury — approve in dashboard" state with the sandbox dashboard link.
- Keep the visual language of `docs/index.html` (tokens, fonts). Don't build a marketing page.

### D. Docs + deck
- Wire `/docs` to serve the static HTML.
- Add `docs/personal-account-surface.md` from step 2.
- Update `api-friction-log.md` with anything new (sandbox gaps, elicitation support per client, mcp-handler quirks).
- Stretch: Remotion composition that replays `explainer.html` steps as a 60-second video.

### E. CLI pipe (optional, 20 min)
`apps/cli/steward.ts`: read jsonl transactions on stdin, print proposals as a table / `--json`. Demo line:
`mercury transactions list --format jsonl | steward audit`.

## 5. Demo script (target 6–8 minutes)

1. `docs/index.html` — 60 s on the thesis and the serverless/IP finding.
2. Claude.ai (or ChatGPT) with the Steward connector: "Where am I wasting money?" → real findings from the personal account.
3. "Sweep the idle cash." → Approve prompt in the chat (gate 1) → "queued in Mercury."
4. Switch to sandbox dashboard → pending transfer with Steward's note (gate 2) → approve.
5. Same flow in our web UI, 30 s, to show the surface we own.
6. `mercury … | steward audit` in a terminal, 20 s.
7. `docs/explainer.html` as the wrap: what Mercury's MCP does today vs. this tier; the API changes we'd ask for.

## 6. Guardrails

- Never log or return `accountNumber`/`routingNumber`/full card data.
- Never call `POST /account/{id}/transactions` (direct send) or `POST /transfer` (direct internal transfer). Only `request-*` endpoints, only against sandbox.
- No production write token. If one is ever needed, stop and ask.
- Token hygiene: the read-only prod token dies after 45 days unused — irrelevant for the demo window; note it in the deck.
- Language: proposals say "you could," not "you should"; no tax/investment advice phrasing.

## 7. Open questions to answer during the build

- Which of Claude.ai / ChatGPT / Grok support MCP elicitation today? Record per client; it changes which client is the hero demo.
- Does the sandbox seed data carry `merchant.categoryCode` and `mercuryCategory`? If not, the audit demo must run on production reads only.
- Does `mcp-handler` support `elicitInput`? If not, use `@modelcontextprotocol/sdk` server directly in a Node runtime route.
