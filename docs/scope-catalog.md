# Custom-token scope catalog (sandbox dialog, 2026-09-16)

Transcribed from the Mercury sandbox "Create an API token → Custom Scopes"
picker. This list is not published anywhere in the docs (friction #6, #40).
`*` = requires an IP allowlist. Identifiers used in the docs (e.g.
`RequestSendMoney`) do not appear in the picker.

| Group | Scope | Allowlist | Backs (our best mapping) |
|---|---|---|---|
| Accounts | Fetch Account Statements (Experimental) | — | `GET /account/{id}/statements`, statement PDF |
| Accounts | Fetch Credit Accounts | — | `GET /credit` |
| Accounts | Fetch Depository Accounts | — | `GET /accounts`, `GET /account/{id}` |
| Accounts | Fetch Treasury Accounts | — | `GET /treasury`, treasury statements |
| Cards | Create Cards | `*` | `POST /cards` |
| Cards | Fetch Cards | — | `GET /cards`, `GET /card/{id}`, `GET /account/{id}/cards` |
| Cards | Manage Cards | `*` | update / freeze / unfreeze / cancel |
| Cards | Reveal Card PAN | `*` | Vault `reveal` (agent cards) |
| Categories | Fetch Categories | — | `GET /categories` (create/edit/delete: not seen in picker) |
| Invoices | Fetch Invoices | — | `GET /ar/invoices` (+ customers? unclear) |
| Invoices | Modify Invoices | `*` | create / update / cancel invoice |
| Recipients | Create Recipients | `*` | `POST /recipients` |
| Recipients | Edit Recipients | `*` | `POST /recipient/{id}` |
| Recipients | Fetch Recipients | — | `GET /recipients`, `GET /recipient/{id}` |
| Recipients | Create Recipient Invites | `*` | `POST /recipients/invites` |
| Recipients | Edit Recipient Invites | `*` | delete invite |
| Recipients | Fetch Recipient Invites | — | list / get invites |
| Organization | Fetch Organization | — | `GET /organization` |
| Transactions | Fetch Send Money Requests | — | `GET /request-send-money[/{id}]` |
| Transactions | Fetch Transactions | — | `GET /transactions`, `GET /transaction/{id}`, account-scoped variants |
| Transactions | Fetch Treasury Transactions | — | `GET /treasury/{id}/transactions` |
| Transactions | Fetch Treasury Statements | — | treasury statements |
| Transactions | **Send Money with Approval** | — (dialog still required an IP; see #39) | `POST /account/{id}/request-send-money` |
| Transactions | Send Money | `*` | `POST /account/{id}/transactions` |
| Transactions | Update Transactions | `*` | `POST /transaction/{id}` (note / category) |
| Webhooks | Fetch Webhooks | — | list / get |
| Webhooks | Create Webhooks | (cut off) | `POST /webhooks` |

**Not in the picker (as far as visible):** any scope for `POST /request-transfer`
(transfer with approval), `POST /transfer`, customers (AR), users, SAFEs,
events, attachments, categories create/edit/delete. Some may be further down
the list; the two transfer endpoints appear to have no Custom scope at all.

Selected for Steward: the eleven non-asterisk reads above plus Send Money with
Approval. No asterisked scope.
