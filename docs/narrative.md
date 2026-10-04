# Steward: closing the month from Claude Code

A walkthrough of what we built, why, and what we learned doing it.

**Watch the walkthrough** (about 4½ minutes, recorded 2026-09-17): close the
month, pay a bill through both approvals, and watch Mercury refuse a transfer.
[Video](https://cfsno74zv8ik3jwj.public.blob.vercel-storage.com/video/mercury-end-of-month-close-2026-10-04.mp4),
also embedded in `narrative.html` and the memo (`index.html`).

## The job

I'm a technical founder. My company banks with Mercury. Every month-end I do
the same dozen things in the dashboard: check where cash sits across accounts,
see which bills are due this week and pay them, chase invoices that are late,
and move idle cash out of checking into something that earns yield. None of
it is hard. All of it is clicking.

I already live in Claude Code. I want to type **"close the month"** there and
get back what needs doing, with the payments and transfers ready to go, and
have nothing move until I say so.

That's Steward: a month-end close agent for a Mercury business account, used
from Claude Code.

## Why this shape

**Why agentic, why Claude Code.** The brief asked for something headless on
Mercury's API, for its most ambitious API customers. Those customers are
technical founders and finance engineers who already work in a terminal with
an agent beside them. An MCP server meets them there, with no new app to open.
Claude Code is also the client where approval works best today: it can show an
Approve / Decline prompt inside the conversation (MCP elicitation). Claude.ai,
ChatGPT, and Grok can't yet.

**Why month-end close.** It's recurring, it's specific, and it touches every
part of the API that matters for money: balances, transactions, recipients,
invoices, payments, transfers, and approvals. If an agent can do a close, it
can do most of what a founder wants from their bank.

**The one rule: the agent can't move money.** Steward reads and proposes. It
never sends. Every payment or transfer passes two gates:

1. **In Claude Code:** I approve the proposal in the conversation.
2. **In Mercury:** it lands in Mercury's own approval queue, and a human
   approves it in the dashboard before anything moves.

Steward only calls Mercury's *request* endpoints (`request-send-money`,
`request-transfer`). There is no code path to a direct send, and the client
refuses production tokens outright. This isn't caution for its own sake. It's
the model Mercury already uses in Command and its approval policies. Steward
tests whether a third-party agent can use it.

## What it does (the demo)

1. **"Run month-end close."** Steward reads accounts, transactions, recipients,
   invoices, and treasury, then reports: cash by account; an operating floor
   (two months of average outflow, by *posted* date); one bill due in two days
   that can be paid (Alex Rivera, $1,255); two bills from vendors with no
   saved recipient; and a surplus it could sweep. Nothing is queued.
2. **"Pay the Alex Rivera bill."** Claude Code shows Approve / Decline. I
   approve. Steward calls `request-send-money` and returns the request, marked
   `pendingApproval`, with a link straight to it in Mercury.
3. **In Mercury, as a second teammate,** I open the link and approve. The ACH
   goes out. The resulting transaction carries the request id back, so the
   trail from "agent proposed" to "human approved" to "money moved" is
   complete.
4. **"Sweep the surplus to savings."** I approve in Claude Code; Mercury
   refuses, because no API token scope exists for transfer requests. Steward
   says that in plain words, tells me how to do it by hand, and doesn't ask me
   to approve it again.

That last step is on purpose. The demo shows where the API stops as well as
where it works.

## How we got here: brute force

We didn't start from a spec. We pointed the agent at Mercury's sandbox and let
it walk into every wall, then logged each one. That's also the fairest test of
an API meant for agents. SaaStr's version of it: *"can a frontier model, given
only your docs, make this work on the first try."* It didn't, and each miss is
evidence.

Roughly in the order it happened:

- **Getting a token that works.** The recommended propose-only token still
  required an IP allowlist, despite the docs. The first call failed anyway:
  the laptop connected over IPv6 and the allowlist was IPv4. Mercury's own CLI
  hits the same wall and has no way around it.
- **Reading the books.** Reads worked, but quietly wrong in ways a model won't
  notice. A misspelled filter returns *all* the data with a 200. `start` and
  `end` filter by creation date, not the posted date the dashboard shows;
  Steward's own close used the wrong one until the sandbox exposed it. A third
  of transactions belong to a credit account that `/accounts` doesn't list.
- **The first payment request.** `400 invalidApproval`: "Nobody else in this
  organization can approve this payment." A one-person company can't use the
  approval queue at all. The solo founder, the person most likely to want this
  agent, is exactly who's locked out.
- **Adding a second approver.** A second real user, a phone number, SMS opt-in,
  and mandatory two-factor, all for fake money. Then the request went through.
- **Retrying.** Sending the same request again with the same idempotency key
  returned an error instead of the original request. An agent that times out
  can't tell "already done" from "failed."
- **Finding the approval.** The API response has no link to it. It isn't under
  Tasks. It's under Payments → Needs Approval, where a second request sat that
  the API couldn't see.
- **The official tools.** Mercury's CLI gets a lot right (it won't run a money
  command without `--yes`, and it catches mistyped flags). But its
  `payments transfer` is a *direct* transfer sitting next to
  `payments request`. Our agent ran it expecting an approval request; only the
  token's missing scope stopped it. And probing Mercury's MCP turned up an
  undocumented sandbox host that advertises `transactions:request` and
  `transfers:request` scopes. The capability this whole project argues for
  looks like it's already being built.

Each of those is an entry in the friction log, with what to ship. Seventy-five
entries in all, most of them small.

## What it tells Mercury

The short version, from `findings.md`:

**Mercury's API is agent-readable but not agent-actionable.** The right
primitive exists: queue an action for a human to approve. Four things keep
agents from using it:

1. It isn't exposed to agents in production, and it's gated by an IP allowlist
   that hosted agents can't satisfy.
2. A one-person company can't use it.
3. Retries aren't safe.
4. The API fails silently on the mistakes models make.

The sandbox MCP's scopes suggest Mercury is already on the first. The other
three are smaller, and they're what separates a demo from something a founder
would trust with real money.

**On two-factor.** Agent-readiness checklists count "requires a human with
2FA" against an API. Here it guards approving a money movement, not logging
in, and that's the point.

## What's honest to say about the limits

- **Sandbox only.** No production token, by design.
- **No receivables in the demo.** The sandbox has no invoices, and creating
  them needs an allowlisted token. Follow-ups are covered by tests and the
  offline smoke test.
- **Bills live outside Mercury.** There's no Bill Pay API, so Steward reads
  bills from a file that `npm run demo:prep` writes before each demo.
- **Approval in chat is a developer-client feature today.** Claude.ai and
  ChatGPT get an approve link instead, and hosting the app publicly would
  bring back the allowlist problem.

## What I'd do next

1. Point Steward at the sandbox MCP's request scopes when they're documented,
   and drop our own write path.
2. Add a `request_status` tool, so "did it go through?" is answerable from
   Claude Code instead of the dashboard.
3. Turn the close into a Claude Code skill a founder installs once and runs
   every month.

---

- **Run it:** `PLAN.md` §5
- **Evidence:** `findings.md`, then `api-friction-log.md`
- **Raw probe results:** `sandbox-surface.md`
