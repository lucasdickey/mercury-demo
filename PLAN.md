# Steward — execution plan (rev 2: business, sandbox-only)

Hand-off document for whichever model/agents execute the build. Read
`CLAUDE.md`, `docs/direction.md`, `docs/landscape.md`, and
`docs/api-friction-log.md` first; this file is the *what to do*, those are the
*why*. Rev 1 (personal account, production reads) is superseded — see §9.

## Brute force: what I expected vs. how far I pushed

**I didn't scope this down to what would demo cleanly. I brute-forced it.** The
brief asks for about two hours. What I expected to build was modest: an agent
that reads the books and queues a payment and a sweep for approval. Instead of
stopping at the first wall and mocking around it, I pushed every step of the
workflow until Mercury itself said no — new tokens, new scopes, a second human
in the org, the official CLI, the undocumented sandbox MCP — and logged each
wall. Where the plan and reality diverge, reality won, and the gap is the
finding.

| What I expected to do | How hard I pushed | Where it actually stopped |
|---|---|---|
| Get a sandbox token and start calling the API. | Read-write token, then a Custom token with the approval scope; the first call still failed because the laptop connected over IPv6. | Every write-capable token demands an IP allowlist, sandbox included, docs notwithstanding, and in practice it's IPv4-only [38, 39, 44]. |
| Read cash position across accounts. | Pulled every account and transaction; checked the numbers against the dashboard. | Works, but quietly wrong: misspelled filters return everything with a 200, and `start`/`end` mean `createdAt`, not posted date. Steward's own close used the wrong one until the sandbox exposed it [46, 47]. |
| AR: chase overdue invoices. | Looked for invoices, then tried to create them. | The sandbox seeds none, and creating one needs an allowlisted read-write token [28, 45]. Covered by tests and the offline smoke test, not live. |
| AP: pay a vendor through the approval queue. | Hit `400 invalidApproval`, then added a second real person to the org (phone, SMS opt-in, mandatory 2FA — for fake money) and approved as them. | **Works end to end**: request → approve in Mercury → ACH sent with the request id linked back. But a one-person company can't use it at all [58], retries with the same idempotency key fail instead of replaying [59], and the API returns no link to the approval [64]. |
| Sweep surplus to treasury. | Called `request-transfer` live, then went looking for a scope that would allow it. | No token scope exists for transfer requests [41], and the sandbox has no treasury account. Steward says so plainly and doesn't re-ask. It's in the demo *because* it fails. |
| Use Mercury's own tools instead of mine. | Drove the official CLI and probed Mercury's MCP, including hosts the docs don't mention. | The CLI's `payments transfer` moves money directly, next to `payments request` [68]; the production MCP is read-only; an undocumented sandbox MCP advertises exactly the request scopes this project argues for [18]. |
| Host it and approve from Claude.ai or ChatGPT. | Deployed to Vercel; checked each client's support for approvals. | A hosted app can read but not queue (the allowlist again), and consumer chat clients can't render the approval, so they get an approve link instead (§7). |

The expectation was a working demo. The result is a working demo **plus a
map of exactly where an agent on Mercury runs out of road**: 75 entries in
`docs/api-friction-log.md`, ranked in `docs/findings.md`. That map is the
main deliverable.

## 0. Decisions already made (do not relitigate)

| Decision | Choice |
|---|---|
| Concept | **Steward** — a propose-only agent tier on Mercury for a technical founder running **month-end close from the terminal**. Read → analyze → propose → approve (gate 1: in the client when it can render it) → approve in Mercury (gate 2: approval queue). The agent has no path to move money. |
| Persona | Founder/CFO of a small startup. The sandbox org *is* the company. |
| Workflow | (1) cash position across accounts, (2) AR: overdue invoices we sent → follow-ups, (3) AP: pay vendors from the recipient list → approval queue, (4) sweep operating surplus to treasury/savings → approval queue. |
| Environment | **Sandbox only.** `https://api-sandbox.mercury.com/api/v1` for every call. One sandbox token (read-write is fine in sandbox; there is no real money). No production tokens in the build. |
| Hosting | Vercel, one Next.js app. MCP at `/api/mcp/[secret]`, chat UI at `/`, approve page at `/approve/[token]`, docs at `/docs`. |
| Hero client | **Claude Code** — renders MCP elicitation (gate 1) and is the persona's actual tool. `claude mcp add --transport http steward https://<app>/api/mcp/<secret>`. |
| Other clients | Claude.ai, ChatGPT, Grok: connect for reads + proposals; approvals fall back to the **approve URL** (surface we own). Web chat (AI SDK): full flow. `mercury … \| steward` CLI pipe: audit only. |
| MCP auth | Long random path segment + server-side check. Real OAuth is a "what's next" slide. |
| Model | Claude via Vercel AI SDK, `claude-sonnet-5`. |
| Presentation | `docs/index.html` memo + `docs/explainer.html` walkthrough. Remotion render = stretch. |
| Standing task | **Keep cataloging.** Every paper cut goes in `docs/api-friction-log.md` under the right layer (API · MCP · CLI · docs · sandbox · ecosystem) with severity and a proposed fix. This is a deliverable, not a side effect. |

## Status (2026-09-15, end of day)

Built and green without a sandbox token:
- `packages/core`: sandbox-only Mercury client (refuses production, redacts account/routing numbers, follows cursors), analyzers (cash floor, overdue AR, bills-due AP with recipient matching, treasury sweep), zod proposal schema, `closeMonth()` / `queueProposal()`. **11/11 tests.**
- `apps/web`: MCP route with real MRTR elicitation + HMAC `requestState` + approve-URL fallback; chat UI on AI SDK 7; `/approve/[token]`; `/docs` served statically. **`next build` passes.**
- `npm run smoke` — offline end-to-end with a mock Mercury and the real MCP client SDK: `tools/list`, `close_month`, approve-URL fallback for clients without elicitation, and the full MRTR round trip (form → accept → signed re-entry → `POST /request-transfer` with the proposal id as idempotencyKey → `pendingApproval`; decline → nothing queued). 7/7 checks.

~~Blocked on the sandbox token~~ Token in hand (Custom, IPv4-allowlisted). **§2 read recon done 2026-09-16 → `docs/sandbox-surface.md`, friction #45–57.** Live read-only `closeMonth`: 0 follow-ups, 0 pays, 3 unmatched bills, 1 un-queueable sweep — seed data can't exercise AR/AP/treasury. **§2 writes 2026-09-16: `request-send-money` → 400 `invalidApproval` (one-member org can't self-approve, #58); `request-transfer` → 403 (no scope, #41). Second org member added → `request-send-money` 200 `pendingApproval`; idempotent retry → 400 (#59).** **Gate 2 verified end to end:** second member approved in Payments → Needs Approval → request `approved` → ACH transaction `sent` with `requestId` back-link. Still open: seeding, the `createdAt` fix in `closeMonth` (#47), Claude Code end-to-end. Requires Node ≥ 22 (`Object.groupBy`).

## 1. Preconditions (human)

- [ ] Sandbox account at https://sandbox.mercury.com/signup → sandbox API token (read-write, no allowlist needed? **verify** — if the sandbox modal also demands an IP allowlist for read-write, log it and use a Custom token with `RequestSendMoney` + reads).
- [ ] `.env.local` in repo root: `MERCURY_SANDBOX_API_TOKEN=secret-token:mercury_sandbox_…`, `ANTHROPIC_API_KEY`, `MCP_PATH_SECRET` (32+ random chars), `STATE_SECRET` (32+ random chars).
- [ ] Vercel project linked; same vars in Production + Preview; Deployment Protection **off** for the MCP route.

## 2. Step 1 — sandbox recon (30 min, blocking)

Sweep the sandbox and write `docs/sandbox-surface.md`: status, row counts, and a
redacted sample per endpoint. This is both our data-availability check and a
friction-log source (the docs don't enumerate what the sandbox seeds).

```
GET /accounts                 # kinds present? checking/savings/treasury/credit? balances?
GET /transactions?limit=200   # merchant.categoryCode? mercuryCategory? counterpartyName? kinds?
GET /recipients               # how many vendors seeded? payment methods?
GET /invoices  GET /customers # AR seeded? statuses (unpaid/overdue)?
GET /treasury                 # exists in sandbox?
GET /credit
GET /categories  GET /merchants?limit=5
GET /organization  GET /users
GET /cards
GET /request-send-money       # approval-request list — does the concept exist here?
GET /events?limit=3           # events in sandbox? (webhooks are documented as unavailable)
```

Then the writes we depend on, each with a unique `idempotencyKey`, small amounts:
```
POST /account/{checkingId}/request-send-money      {recipientId, amount, paymentMethod:"ach", idempotencyKey}
POST /account/{checkingId}/request-transfer-money  {destinationAccountId, amount, idempotencyKey}   # treasury or savings
POST /invoices  (only if AR create works without IP allowlist in sandbox; else log it)
```
Confirm each 200s **and appears in the sandbox dashboard's approval queue**, then
approve one in the dashboard and confirm the resulting transaction shows in
`GET /transactions`. If the sandbox has no approval queue UI, that's a 🔴 finding
and gate 2 becomes "status polling on `GET /request-send-money/{id}`" for the demo.

If seed data is thin (few recipients, no invoices), seed it via API:
`POST /recipients` ×5 vendors, `POST /customers` ×3, `POST /invoices` ×4 (two overdue).
Record what had to be seeded — that's a friction entry ("sandbox needs a
realistic seed profile").

## 3. Repo layout

```
mercury-demo/
  PLAN.md  CLAUDE.md  .env.example
  docs/                          # static, served at /docs
    index.html explainer.html direction.md landscape.md api-friction-log.md sandbox-surface.md take-home-brief.md
  packages/core/                 # framework-free TS
    src/mercury/client.ts        # sandbox base URL, bearer auth, cursor pagination, redaction of accountNumber/routingNumber
    src/mercury/types.ts         # hand-typed from llms.txt fragments (no codegen — no single OpenAPI file exists; log it)
    src/analyze/cash.ts          # position by account kind; operating floor = max(60-day min balance, 2× monthly outflow)
    src/analyze/ar.ts            # invoices: unpaid, overdue (dueDate < today), days late, amount → follow-up proposals
    src/analyze/ap.ts            # recipients + a small "bills due" list (seeded JSON: vendor→amount→due) → pay proposals
    src/analyze/sweep.ts         # surplus = available − floor − AP due → sweep proposal to treasury (or savings if no treasury)
    src/intents.ts               # zod: Proposal = followup | pay | sweep ; {why, evidence[], amount, requires_approval, reversible}
    src/steward.ts               # closeMonth(): runs all analyzers → proposals[] ; propose*() → sandbox request-* calls
  apps/web/                      # Next.js App Router, Node runtime
    app/api/mcp/[secret]/route.ts
    app/api/chat/route.ts
    app/approve/[token]/page.tsx # fallback gate 1 for clients without elicitation
    app/page.tsx                 # chat + proposal cards
  apps/cli/                      # optional: `steward close` reading jsonl from stdin
```

pnpm workspaces, TypeScript strict, no DB. Approval state lives in Mercury.

## 4. Work packages (parallelizable)

### A. `core`
- Client + types as above. `listAll*` helpers follow `page.nextPage`.
- `cash.ts`: group `GET /accounts` by `kind`; sum available; compute floor.
- `ar.ts`: `GET /invoices` → filter unpaid; overdue if `dueDate < now`; proposal `followup {customer, invoiceId, amount, daysLate}` (`requires_approval:false` — it's a message draft, no API for reminders; log that).
- `ap.ts`: bills-due list is a seeded JSON in `src/catalog/bills.json` mapping recipient names → amount/due (Mercury has no Bill Pay API — log it). Proposal `pay {recipientId, amount, memo, due}`.
- `sweep.ts`: surplus after AP; target = treasury account if present else savings; proposal `sweep {from, to, amount, why}`.
- Acceptance: unit tests on fixtures from `docs/sandbox-surface.md`; `closeMonth()` < 2 s.

### B. MCP route
- `mcp-handler@^2` + `@modelcontextprotocol/server@^2` + `zod@^4`, Node 20+, protocol 2026-07-28, `maxDuration = 60`. Not the v1 `@modelcontextprotocol/sdk`.
- Tools: `cash_position()`, `close_month({asOf?})` → proposals, `propose_payment({recipientId, amount, memo})`, `propose_sweep({fromAccountId, toAccountId, amount})`.
- **Gate 1 — MRTR elicitation.** First call returns `inputRequired({ inputRequests: { approve: inputRequired.elicit({ type:"form", fields:[{name:"approve", type:"boolean", required:true, label:"Queue $X to <vendor> for approval in Mercury?"}] }) }, requestState: await codec.mint({...}) })`; on re-entry read `acceptedContent(ctx.mcpReq.inputResponses, "approve")`; if true → sandbox `request-*` call; else declined. **Always include `inputRequests`** (state-only results break Claude.ai, anthropics/claude-ai-mcp#1027).
- **Capability fallback.** If `ctx.mcpReq.envelope?.clientCapabilities?.elicitation` is absent → return the proposal with `approve_url: https://<app>/approve/<signed token>` and instructions. Never execute, never fake a confirm via a second tool.
- Acceptance: Inspector lists 4 tools; Claude Code shows Approve/Decline on `propose_payment`; sandbox dashboard shows the queued payment; Claude.ai gets the approve link and it works.

### C. Web chat + approve page
- AI SDK `useChat`/`streamText`, tools imported from `core`. Proposal cards with Approve/Decline for `requires_approval` items → same sandbox `request-*` call → "queued in Mercury" state with dashboard link.
- `/approve/[token]`: verify signed token, render one proposal, Approve → queue. This is the fallback gate for Claude.ai/ChatGPT/Grok.
- Visual language from `docs/index.html` tokens.

### D. Docs + friction log (continuous)
- `docs/sandbox-surface.md` from §2.
- Append to `docs/api-friction-log.md` as you go, tagged by layer: `[api]` `[mcp]` `[cli]` `[docs]` `[sandbox]` `[ecosystem]`.
- Update `docs/index.html` findings ledger with the top new items at the end.

### E. CLI pipe (optional)
`mercury accounts list --format jsonl` + `mercury transactions list --format jsonl` piped into `steward close --json`. Note whether the official CLI honors `--base-url https://api-sandbox.mercury.com/api/v1` with a sandbox token (it has no `--sandbox` flag — log it).

## 5. Demo script (7–8 min, Claude Code, verified e2e 2026-09-16)

Everything below has been run against the live sandbox, API and dashboard.

### Before (5 min)
1. Node ≥ 22 (`nvm use 25`). Start the app without the shell's Anthropic key (it overrides `.env.local`):
   `env -u ANTHROPIC_API_KEY PORT=3200 PUBLIC_BASE_URL=http://localhost:3200 npm run dev`
   (add `STEWARD_DEBUG=1` to log every MCP call).
2. `npm run demo:prep` — checks the token, picks the sandbox's ACH-payable recipient (Alex Rivera), writes
   `.demo/bills.json` dated from today, warns about leftover pending approvals, previews `close_month`.
   Expect: 1 payment, 2 unmatched bills, 1 sweep, 0 follow-ups.
3. Claude Code, new terminal: `claude mcp add --transport http steward "http://localhost:3200/api/mcp/<MCP_PATH_SECRET>"` (prep prints it), `/mcp` shows 4 tools.
4. Second Chrome profile signed in as the second org member (the approver) on
   https://sandbox.mercury.com/payments/approvals. Reject leftovers from earlier runs so the queue is clean.

### Run
1. **Memo, 60 s.** `docs/index.html` → `findings.md` BLUF: agent-readable, not agent-actionable.
2. **"Run month-end close."** → `close_month` (read-only). Talk track: cash by account, operating floor from
   *posted* dates (the API's `start` means `createdAt`, #47), Alex Rivera $1,250 due in 2 days, two bills with no
   saved recipient (Acme Hosting; Northstar Legal, overdue), a surplus sweep. No receivables: the sandbox has no
   invoices and this token can't create them (#28). Nothing is queued.
3. **"Pay the Alex Rivera bill."** → `propose_payment` → Claude Code shows Approve / Decline (**gate 1**) → Approve →
   `request-send-money` → `pendingApproval` + a link straight to the request in Mercury.
   Talk track: the agent can only *request*; there is no send path in the code.
4. **Switch to the approver's window**, open the link → Approve (**gate 2**) → Payments → Paid shows the ACH,
   pending. Talk track: the requester can't approve their own request, so a one-person company can't use this at
   all (#58); the API returns no `dashboardLink` for requests, Steward builds it (#64); approvals never reach Tasks.
5. **"Sweep the surplus to savings."** → gate 1 → Approve → Mercury refuses: no token scope exists for transfer
   requests (#41). Steward says so in plain words and tells you how to do it by hand. Ask again → it doesn't ask you
   to approve something Mercury will refuse. Talk track: without a dry run (#58), every agent has to learn refusals
   after the human already said yes.
6. **Wrap, 60 s.** `findings.md` top five, `docs/explainer.html`.

### Not in the live demo, and why
- **Overdue-invoice follow-ups:** no invoices in the sandbox; creating them needs an allowlisted token (#28, #45).
  Covered by unit tests and `npm run smoke`.
- **A successful sweep:** no transfer-with-approval scope (#41). The smoke test runs it against the mock.
- **Claude.ai / ChatGPT approve link:** needs a public URL; hosted on Vercel the app could read but not queue
  (IP allowlist, #39). Show `npm run smoke` output: clients without elicitation get the approve URL.
- **Web chat UI:** removed 2026-09-17. The demo is Claude Code; the site root now redirects to the docs.

### If something goes wrong
| Symptom | Cause / fix |
|---|---|
| Mercury 401 `ipNotWhitelisted` | New network or IPv6; add the IPv4 shown in the error to the token allowlist (#44) |
| "Mercury already has this request" | Same bill proposed earlier today (same idempotency key); reject it in the dashboard or use it |
| "Nobody else in this organization can approve" | The second org member was removed or lacks approve permission |
| Payment proposal missing | App isn't reading `.demo/bills.json`; re-run `npm run demo:prep` |

## 6. Guardrails

- Sandbox only. If any code path can reach `api.mercury.com`, that's a bug.
- Never call `POST /account/{id}/transactions` (direct send) or `POST /transfer` (direct internal transfer). Only `request-*`.
- Never log/return `accountNumber`, `routingNumber`, card data.
- Proposals say "you could," not "you should."

## 7. Client matrix (verified 2026-09-15)

| Client | MCP | Elicitation (gate 1) | Role in demo |
|---|---|---|---|
| Claude Code | ✓ | ✓ form | **Hero** |
| Cursor / VS Code | ✓ | ✓ form | Alternate |
| Vercel AI SDK (`@ai-sdk/mcp`) | ✓ | ✓ form | Our web UI |
| Claude.ai | ✓ | ✗ (#153 open since Apr; state-only results error, #1027) | Reads + approve-URL |
| ChatGPT Dev Mode | ✓ | no evidence | Reads + approve-URL |
| Grok (grok.com connectors) | ✓ tools only | ✗ — elicitation times out (`emrgim/marriott-mcp#16`) | Reads + approve-URL |

Spec note: MCP 2026-07-28 made elicitation stateless (MRTR); sampling/roots deprecated. Don't use them.

## 8. Still open (need sandbox)

- ~~What the sandbox seeds~~ → `docs/sandbox-surface.md`: 9 depository + 1 credit account, 150 txns, 79 recipients (not vendor-like), 0 invoices/customers/treasury/statements, no categories or MCCs applied.
- Whether the sandbox has an approval-queue UI and whether `request-*` requests appear there.
- ~~Whether sandbox read-write tokens demand an IP allowlist~~ → yes, and so does the approval scope (#38, #39); allowlist is effectively IPv4-only (#44).
- Whether the official CLI works against the sandbox via `--base-url`.

## 9. Why rev 2 replaced rev 1

Rev 1 audited a personal account on production reads and queued writes to the
sandbox. Problems: the brief targets business customers; personal accounts may
lack approval-queue endpoints; splitting reads (prod) and writes (sandbox) made
the demo incoherent; consumer chat clients can't render approvals, so the
"approve in ChatGPT" moment wasn't real. Rev 2 puts the whole loop in one
business sandbox org with Claude Code as the hero — the persona Mercury itself
cites for its CLI. The personal token is an optional epilogue if time allows.
