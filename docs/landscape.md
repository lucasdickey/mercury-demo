# Mercury agent-surface landscape (as of 2026-09-14)

What already exists, so we build *on* it rather than re-implement it. All facts
below were pulled from docs.mercury.com (`.md` pages), the mercury-cli repo, and
press coverage; items marked **unverified** need a real token or sandbox login.

## Products

| Surface | Status | Notes |
|---|---|---|
| **Mercury Command** (Jun 16 2026) | GA in dashboard + mobile | NL assistant; "business and personal finances"; every action goes through existing approval rules; sensitive data never reaches the model. Not exposed via API/MCP. The take-home is literally named after it. |
| **REST API** `api.mercury.com/api/v1` | GA | ~80 endpoints. Bearer or basic auth with `secret-token:…`. Cursor pagination everywhere (`limit` ≤1000, `start_after`/`end_before`). |
| **Mercury CLI** (May 2026, Go, Apache-2.0) | GA | `mercury <resource> <cmd>`; OAuth (`mercury login`) or `MERCURY_API_KEY`; `--format json|jsonl|yaml|pretty|explore`; `--transform` (GJSON); idempotency keys; `--base-url` (no `--sandbox` flag). No AGENTS.md / skills / MCP in the repo. |
| **Mercury MCP** `https://mcp.mercury.com/mcp` | Beta | Hosted, streamable HTTP, OAuth 2.0 w/ DCR (RFC 7591) + PKCE S256. Scopes: `read`, `offline_access` only. **~30 tools, all reads** — no writes, no `requestSendMoney`, no categorize. Works in Claude, ChatGPT, Claude Code, Codex. |
| **Agent cards + Vault API** (Aug 11 2026, "Mercury Spend") | GA for business | Virtual cards an agent can use autonomously; budget / merchant lock / category lock enforced at auth time; PAN/CVC reveal via `vault-api.mercury.com` for `isAgentCard: true` cards only. `POST /cards` cannot *create* an agent card (flag is read-only; set in dashboard). |
| **Webhooks / Events** | GA (prod only) | `transaction.created/updated`, `*.balance.updated`. JSON Merge Patch bodies with `changedPaths` + `previousValues`. HMAC-SHA256 `Mercury-Signature`. Events retained 90 days. **Not available in sandbox.** |
| **Sandbox** `api-sandbox.mercury.com` | GA | Pre-seeded org with accounts, transactions, balances. AR (invoicing) and recipients/payments confirmed to work there. Separate tokens (`mercury_sandbox_` prefix). OAuth sandbox at `oauth2-sandbox.mercury.com`. **No webhooks.** Undocumented: treasury, credit, cards, vault, events, approval-queue UI, MCC/category on seeded txns, seed counts. |
| **Plaid** | Mercury is a Plaid institution | Supports Auth, Balance, Transactions, Assets (depository + investment). |
| **n8n community node** | Community | Exists; signals no-code automation demand. |

## Data model highlights (what makes a savings/efficiency agent possible)

`Transaction` carries, per row:
- `kind` (23-value enum incl. `debitCardTransaction`, `creditCardTransaction`, `outgoingPayment`, `internalTransfer`, `interestPayment`, **`personalBankingSubscriptionFee`** ← personal accounts are in the model)
- `mercuryCategory` (39-value enum: Software, Memberships, InternetAndTelephone, Utilities, Insurance, Entertainment, FoodDelivery, …)
- `merchant.{id, categoryCode (MCC), category, currency, amount}` on card txns
- `counterpartyName`, `counterpartyNickname`, `bankDescription`, `externalMemo`, `note`
- `categoryData` (custom category), `glAllocations`, `cardId`, `relatedTransactions`, `currencyExchangeInfo` (FX fee leakage!)
- filters: `search`, `start/end`, `postedStart/postedEnd`, `accountId[]`, `cardId[]`, `mercuryCategory`, `categoryId`, `status[]`

**Not present:** `isRecurring`, merchant enrichment (logo, site, cancel URL), subscription/plan metadata, `GET /merchant/{id}`. `listMerchants` is only "priority merchants for spend controls."

## Money-movement paths

| Path | Endpoint | IP allowlist? | Human in loop? |
|---|---|---|---|
| Direct send | `POST /account/{id}/transactions` | **Yes** | No (unless org rules) |
| Queue for approval | `POST /account/{id}/request-send-money` | No | **Yes — dashboard approval** |
| Queue internal transfer for approval | `POST …/request-transfer-money` | No (assumed) | Yes |
| Internal transfer | `POST /transfer` | ? (write scope) | No |
| Recipient invite | `POST /recipients/invites` | No | Recipient fills own details |

The "queue for approval" pattern is the agent-safe write path — and it is
**absent from the official MCP**. That is the crux of our API recommendation.

## Machine-payment protocols (context for the PS)

- **x402** (Coinbase, May 2025; v2 Dec 2025 added ACH/card rails)
- **ACP** (Stripe + OpenAI; powers ChatGPT Instant Checkout)
- **AP2** (Google, Sep 2025; signed mandates: intent → cart → payment)
- **MPP** (Stripe + Tempo, Mar 2026; "sessions" pre-authorize a limit, stream micro-payments, fiat + stablecoin)

Mercury's actual machine-payment story today is **agent cards on the card rail**
(Stripe Issuing underneath, per press). An agent card is the *funding source* an
x402/MPP facilitator would draw from; Mercury has no native 402 endpoint.

## Open questions to verify with a real token

1. Does a **Mercury Personal** account get API tokens at all? (Docs never say; enum + Command blog imply yes.) Which endpoints 4xx on personal?
2. Does personal have savings/treasury (for an idle-cash sweep)?
3. Does the sandbox return MCC / `merchant` data and `mercuryCategory` on seeded txns?
4. Are cards / agent cards / vault / events available in sandbox?
5. Does `requestSendMoney` work on personal (approval UI exists there?).

## Prior art: Michelle Bu, "Building a t-shirt factory factory" (Sep 2026)

https://www.breakingchange.blog/p/building-a-t-shirt-factory-factory

Michelle Bu (Stripe; owns APIs and developer tools there) ran the same
experiment we did, at scale: seven coding agents × three runs each (21 runs,
Sep 7–10 2026), each asked to build, deploy, and test a working t-shirt shop
on Stripe + Prodigi with no human help after setup. Only 7 of 21 shops worked;
2 were production-worthy. The failures clustered at the same places ours did:

- **API handoff points** (payment → fulfillment) and error handling; silent failures.
- **Version skew** between client library and webhook handler after a schema change.
- **Discoverability**: agents searched the web once for React but 62 times for
  the unfamiliar API — training data carries the famous ones, docs carry the rest.
- **Onboarding**: no sandbox reachable by an agent before a human signs up;
  launch-blocking config (ToS links, branding) with no programmatic path;
  reluctance to put live keys in an agent transcript.

What she'd ship, in her words: *"Any friction we reduce for agents is friction
we'll reduce for humans as well,"* and *"If you're a developer tools provider,
you should offer a limited sandbox environment to agents before you require a
human."* The Stripe CLI's discoverability and metadata design came out well.

Why it matters here: it is the same method (brute-force the integration, log
where it breaks) from the seat that owns the surface, and it lands on the same
top-tier findings we did for Mercury — sandbox before signup (#27, #38, #39),
versioned/legible spec (#2, #33), and keys that shouldn't have to exist
(#8, #42). Her conclusion is the thesis of our deck: agent-first fixes are
not a niche; they're the ordinary DX backlog, prioritized by what breaks first.
