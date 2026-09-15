# Steward

Month-end close for a company on Mercury: an agent reads the books, proposes
payments and a treasury sweep, and **queues** them for human approval. It has
no path to move money. Built for the Mercury PM take-home ("Command").

- `docs/index.html` — the decision memo (what, why, and what the API/MCP/CLI taught us)
- `docs/explainer.html` — step-through of one close across both approval gates
- `docs/api-friction-log.md` — every paper cut, tagged by layer, with a proposed fix
- `PLAN.md` — build plan and status

## Run it

```bash
npm install
cp .env.example .env.local        # fill in: sandbox token, ANTHROPIC_API_KEY, MCP_PATH_SECRET, STATE_SECRET
npm test                          # core analyzers against fixtures
npm run dev                       # http://localhost:3000  (chat UI)  ·  /docs  (memo)
```

Everything runs against the Mercury **sandbox**. There is no production token
slot; the client refuses `api.mercury.com` unless explicitly overridden in code.

## Connect the MCP server

The endpoint is `/api/mcp/<MCP_PATH_SECRET>` (streamable HTTP, MCP 2026-07-28).

```bash
# Claude Code — renders the in-chat Approve/Decline (gate 1)
claude mcp add --transport http steward https://<your-app>/api/mcp/<MCP_PATH_SECRET>

# Inspector
npx @modelcontextprotocol/inspector https://<your-app>/api/mcp/<MCP_PATH_SECRET>
```

Claude.ai, ChatGPT, and Grok can call the read tools; for `propose_*` they
receive an approve link to `/approve/<token>` instead of an in-chat prompt,
because none of them render MCP elicitation yet (see `PLAN.md` §7).

Tools: `cash_position`, `close_month`, `propose_payment`, `propose_sweep`.

## How approval works

1. **Gate 1 — in the client.** `propose_*` returns `input_required`; the client
   shows Approve/Decline and retries the call with your answer and an
   HMAC-signed `requestState`. No elicitation support → approve URL.
2. **Gate 2 — in Mercury.** Only `request-send-money` and `request-transfer`
   are ever called. They land in Mercury's approval queue. Money moves after a
   human approves there.

## Offline smoke test (no token needed)

```bash
npm run smoke
```

Starts a mock Mercury sandbox, the built app, and two real MCP SDK clients (one
declaring elicitation, one not). Checks the approve-URL fallback and the full
elicitation round trip ending in `request-transfer`. If you write your own MCP
client with the TypeScript SDK, set `versionNegotiation: { mode: "auto" }` —
the default legacy era can't be capability-detected by a stateless server.

## Layout

```
packages/core   Mercury client (sandbox-only, redacting, paginating) · analyzers · proposal schema · closeMonth()
apps/web        Next.js: /api/mcp/[secret] · /api/chat · /approve/[token] · / (chat) · /docs (static)
docs/           memo, explainer, research, friction log
```
