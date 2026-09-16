# Sandbox surface (recon, 2026-09-16)

What the Mercury sandbox actually contains and returns, probed read-only with a
Custom token (the eleven non-asterisk reads + Send Money with Approval; see
`scope-catalog.md`). Reproduce with `node scripts/recon/sweep.mjs <out.json>`.
Sample values are from the seeded org "Not A Real Company Inc."; account and
routing numbers redacted. Friction entries referenced as [#n].

## Verdict for Steward

| Workflow | Data in sandbox | Live `closeMonth` result |
|---|---|---|
| Cash position | ✅ 9 depository accounts, balances ~$1M each | Works. Operating = largest checking ($1.5M), shown by a nickname with the wrong last four [#55] |
| Operating floor | ⚠️ 150 txns, but every `createdAt` is the seed run (Aug 16–Sep 15) while `postedAt` spans Apr–Sep [#47] | Floor $56,404 (2× $28,202/mo), computed off `createdAt` — wrong basis |
| Overdue AR follow-ups | ❌ 0 invoices, 0 customers | 0 proposals |
| Bills due → pay | ❌ 79 recipients, none vendor-like (71 "Currency Cloud Recipient N" intl-wire; 4 ACH) | 0 pay, 3 `unmatched_bill` |
| Sweep to yield | ⚠️ 0 treasury; 2 savings. `request-transfer` has no Custom scope [#41] | 1 sweep of $1,443,600 → savings; **cannot be queued** with this token |
| Approval queue | ❌ `GET /request-send-money` works (empty), but **`POST` → 400 `invalidApproval`**: one-user org, requester can't approve [#58] | Gate 1 accepted in chat → raw 400. Gate 2 untestable without a second org member |

**Bottom line:** reads work; the seed data can't exercise AR, AP, or treasury, and no write can be queued: payments need a second approver in the org [#58], transfers need a scope that doesn't exist [#41].
The demo needs seeding, and seeding recipients/customers/invoices needs
asterisked (allowlisted) scopes this token deliberately doesn't have [#45].

## Endpoint results

`403 scope` = `tokenNotInScope` because the scope wasn't selected (expected).

| Endpoint | Status | Rows | Notes |
|---|---|---|---|
| `GET /accounts` | 200 | 9 | 2 savings, 7 checking, all `type: mercury`. **Credit account absent** [#49] |
| `GET /account/{id}` | 200 | — | Works; **not in the API reference** [#57] |
| `GET /account/{creditId}` | 404 | — | `resourceNotFound` — yet its transactions list fine |
| `GET /transactions?limit=1000` | 200 | 150 | 182 KB (1.2 KB/row). Response has `page`, no `total` |
| `GET /account/{id}/transactions` | 200 | 0–73 | Response has `total`, **no `page`** — different envelope [#51] |
| `GET /transaction/{id}` | 200 | — | 4.4 KB for one txn |
| `GET /recipients` | 200 | 79 | 60 KB. 71 intl wire, 4 ACH, 3 check, 1 RTP. 3× "Banned Recipient", all `active` |
| `GET /recipients/attachments` | 200 | 1 | Returns a presigned S3 URL (12 h expiry) |
| `GET /recipients/invites` | 403 scope | | |
| `GET /ar/invoices` | 200 | 0 | |
| `GET /ar/customers` | 200 | 0 | Granted by "Fetch Invoices" (no customer scope in picker) |
| `GET /treasury` | 200 | 0 | |
| `GET /credit` | 200 | 1 | balance −$1,871; 49 txns on it |
| `GET /categories` | 200 | 23 | Standard set (Software & Subscriptions, Payroll, …) — applied to 0 txns [#48] |
| `GET /organization` | 200 | — | `kind: business`, `subscriptionTier: free`, one DBA |
| `GET /request-send-money` | 200 | 0 | `?status=pendingApproval` accepted |
| `GET /request-transfer[/{id}]` | 403 scope | | No GET is documented for transfer requests at all [#50] |
| `GET /events?limit=1000` | 200 | 319 | 154 txn create, 2 txn update, 107 checking / 50 credit / 6 savings updates. Readable with no events scope in the picker |
| `GET /account/{id}/statements` | 200 | 0 | No statements for any account despite 6 months of postings |
| `GET /cards`, `/account/{id}/cards`, `/users`, `/merchants`, `/webhooks`, `/safes` | 403 scope | | |

## Transactions (150)

- **Accounts:** checking ••3996 73 · credit 49 · checking ••5187 14 · ••8050 6 · ••9379 3 · savings ••5736 2 · ••6579 2 · savings ••2280 1.
- **Kinds:** outgoingPayment 57 · creditCardTransaction 32 · other 31 · externalTransfer 7 · debitCardTransaction 7 · checkDeposit 4 · card intl-fee family 8 · wireFee 2 · internalTransfer 2.
- **Status:** sent 146 · pending 2 · failed 2.
- **Counterparties:** "Alex Rivera" 50 outgoing payments ($47.5k); Gsuite / Amazon / Facebook 10 card txns each; "Fake P. Erson" 7 external transfers (+$7.5M, the balance seed).
- **Enrichment (fill rate):** `mercuryCategory` 0 · `categoryData` 0 · `generalLedgerCodeName` 0 · `merchant` 3 (all `id: "1234567890"`) · `merchant.categoryCode` 2 (both 6011, ATM) · `note` 0 · `bankDescription` 10.
- **Always null** (10 of 35 top-level keys): `feeId, note, reasonForFailure, currencyExchangeInfo, mercuryCategory, generalLedgerCodeName, categoryData, checkNumber, trackingNumber, requestId` [#52].
- **Dates:** `postedAt` < `createdAt` on 82 rows; `postedAt = 0001-01-01T00:00:00Z` on 3 `sent` rows; same sentinel in `failedAt` and `recipient.dateLastPaid` [#53].
- **PII:** `details.creditCardInfo.email` on all 32 credit-card rows is the developer's signup email [#56].

## Query behavior

| Probe | Result |
|---|---|
| `start=2026-09-10` | 145 rows — filters **`createdAt`** |
| `end=2026-06-30` | **0 rows**, though 16 txns posted before then |
| `postedStart=2026-09-10` | 69 rows (correct for a close) |
| `postedstart=…` (case typo) | 150 rows — **silently ignored** [#46] |
| `order=newest` (invalid enum) | 200, treated as `asc` — silently ignored |
| `status=bogus` | 400 `malformedTransactionStatusParam` — validated |
| `start=yesterday` | 400 `malformedDateParam` |
| `limit=100000` | 400, `{errors:{message}}`, no code |
| default order | `asc` (oldest first) |
| cursor paging | `start_after=<nextPage>` works; last page returns `page: {}` |

## Errors — four envelopes [#51]

```
403 {"errors":{"errorCode":"tokenNotInScope","message":"You must have a token with access to this endpoint."}}
404 {"errors":{"errorCode":"resourceNotFound","message":"Couldn’t find the resource for this ID"}}        # /account/{id}
404 {"errors":{"notFound":["We couldn’t find the data associated with your request. Please contact help@mercury.com"]}}  # /transaction/{id}, unknown path, malformed UUID
400 {"errors":{"message":"Page limit size must not exceed 1000."}}
```

## Response headers [#54]

Present: `x-mercury-request-id`, `traceparent`, `cache-control: private, no-store`.
Absent: any rate-limit header (`RateLimit-*`, `X-RateLimit-*`, `Retry-After`).
Also present on every API response: `git-commit`, `ecs-task-name`, `ecs-task-id`,
`mercury-honeycomb-link`, and four `Set-Cookie`s (incl. `_SESSION`) on bearer-token calls.
