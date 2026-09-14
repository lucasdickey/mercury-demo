# Direction — options and recommendation (draft, 2026-09-14)

Status: **proposed, not locked.** Decide before spawning the swarm.

## The frame

The brief says: build for Mercury's *most ambitious* API customers, show
understanding of the CLI/MCP surfaces, weigh trust + simplicity + regulatory
tradeoffs, and tell them what you'd change about the API. Mercury has already
shipped Command (NL in-app), a CLI, a **read-only** MCP, and agent cards. The
thing they have *not* shipped is an agent-safe write path outside the dashboard.
That gap is the story.

## Candidate directions

### A. Efficiency / savings agent (Lucas's option 1)
Mercury transactions (MCC + `mercuryCategory` + counterparty) → recurring-stream
detection → cross-reference with a second source → "here's where money leaks."

- **Pros:** real data (personal prod key), aligns with "Mercury wants you
  efficient, not upsold," makes the *data-model* critique concrete (no
  recurring/enrichment endpoints).
- **Cons / risks:** collapses into a Rocket Money clone if the "second service"
  is just Plaid on the same account; "deals to apply to your account" has no
  clean API (Rocket Money uses Plaid + humans). Personal-banking framing is a
  small slice of Mercury's business — need to show the business analog.

### B. Money movement across contacts / connected accounts (option 2)
Sweep idle cash (`POST /transfer`), pay people (`requestSendMoney`), recipient
invites, Plaid for *other* institutions.

- **Pros:** exercises the write path and the approval model; Plaid adds the
  "whole picture" that Mercury alone lacks.
- **Cons:** real money on a real account — must be approval-gated; Plaid
  Production/Limited-Production onboarding is a time sink for a 2-hour box;
  personal accounts may lack treasury.

### C. Recommended: **"Steward" — a propose-only agent surface** (A + B fused)

An MCP server (+ thin CLI) that adds the tier Mercury's MCP lacks:

```
read  ──►  analyze  ──►  PROPOSE (typed intent)  ──►  human approves in Mercury
```

Three capabilities, each one demoable in a chat client and in a web UI:

| # | Capability | Mercury calls | Second source | Intent it proposes |
|---|---|---|---|---|
| 1 | **Recurring spend audit** | `GET /transactions` (MCC, category, counterparty, FX fees) | Small merchant/plan catalog (curated JSON for top ~40 subscription merchants: tiers, prices, cancel URLs) — optionally Plaid `recurring/get` for non-Mercury accounts | `downgrade`, `cancel`, `consolidate` → writes a note/category on the txn; opens cancel URL; no money moves |
| 2 | **Idle-cash sweep** | `GET /accounts`, `POST /transfer` *or* `request-transfer-money` | Published APY (savings/treasury) | `sweep(from, to, amount, floor)` → queued for approval |
| 3 | **Pay-a-person / bill** | `GET /recipients`, `POST /recipients/invites`, `POST …/request-send-money` | — | `pay(recipient, amount, memo)` → **always** lands in Mercury's approval queue |

Every intent is a JSON object with `why`, `evidence` (txn ids), `reversible`,
and `requires_approval`. Nothing with money side-effects executes directly,
even though the API would let us — that's the trust/regulatory argument, and it
maps 1:1 to the recommendation: **Mercury MCP should expose a `propose` scope
backed by the `request-*` endpoints, plus `updateTransaction` for cleanup.**

**Why this wins on the rubric**
- *Business judgment:* efficiency > upsell; mirrors what Mercury says users want
  (reports, cleanup, cash position).
- *API/CLI/MCP understanding:* we consume the official CLI's JSON, wrap the REST
  API, and ship a sibling MCP that shows the missing tier. We can literally run
  `mercury transactions list --format jsonl | steward audit`.
- *Trust & simplicity:* one mental model — propose, approve. Same as Command.
- *Regulatory/ops:* IP allowlists, dual approval, 45-day token hygiene, PII
  never in the model's context (we redact account/routing numbers in tool
  output). Talk about Reg E / UDAAP for "advice" language.

## Machine-payment angle (the PS)

Honest take: Mercury's rail is **agent cards**, not x402. The interesting API
question is "how does a Mercury agent *fund* an x402/MPP session?" Answer today:
reveal an agent-card PAN via Vault and hand it to a card-capable facilitator.
Stretch demo (slide or mock, not core): agent hits a 402 paywall → Steward
proposes `pay` → on approval uses agent-card credentials (sandbox, if available)
or queues `requestSendMoney` to the merchant-as-recipient. Recommendation for
Mercury: `POST /cards` should accept agent params; publish an "agent funding"
guide covering x402/ACP/AP2/MPP. Keep as a section of the deck unless the
sandbox has agent cards.

## Stack (MVP, not polished)

- **TypeScript monorepo**: `packages/core` (Mercury client + analyzers + intent
  schema, Zod), `packages/mcp` (MCP server over streamable HTTP, deployable to
  Vercel; also stdio for Claude Desktop), `apps/web` (Next.js + Vercel AI SDK
  chat that mounts the same MCP tools), `apps/cli` (tiny wrapper; leans on
  official `mercury` CLI for the boring calls).
- Model: Claude via AI SDK (`claude-sonnet-5` default; Opus for the audit
  reasoning if needed).
- Demo paths: (1) ChatGPT Developer Mode / Grok custom connector → our hosted
  MCP with OAuth-less bearer (demo mode) or our own OAuth; (2) Claude.ai
  connector; (3) web chat UI; (4) `mercury … | steward` pipe.
- Data: personal prod **read-only** token for the audit; sandbox for anything
  that writes. Never a read-write prod token on a laptop.

## Presentation

Remotion, not Three.js, for the main piece: it's data-driven, scriptable by
agents, and can render the actual intent JSON / API calls as animated
sequences. One optional Three.js/2D-canvas "money-flow graph" hero if time
allows. Interactive walkthrough > static deck.

## Swarm plan (once locked)

1. **Token + sandbox recon** (Lucas, manual): personal prod read-only token;
   sandbox signup + token; note which endpoints 403 on personal.
2. Agent A: `core` — Mercury client from `llms.txt` OpenAPI fragments, typed;
   recurring detector; FX-fee + fee-kind leakage; idle-cash calc.
3. Agent B: `mcp` server + intent schema + approval-gated tool wrappers.
4. Agent C: `web` chat (AI SDK) mounting the MCP tools; intent cards UI.
5. Agent D: merchant/plan catalog + (optional) Plaid sandbox recurring adapter.
6. Agent E: friction log → API change proposals doc (RFC style) + Remotion deck.

## Decisions needed from Lucas

- [ ] Go with C? Or lean harder into A or B?
- [ ] Plaid: include (sandbox only, +30–45 min) or defer to "what's next"?
- [ ] Second demo client: ChatGPT (needs Plus/Pro dev mode) or Grok?
- [ ] Deck: Remotion (recommended) vs Three.js.
