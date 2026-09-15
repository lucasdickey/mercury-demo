# mercury-demo

Prototype for the Mercury PM take-home ("Command"). **Rev 2:** a month-end close agent for a founder in Claude Code, sandbox-only, propose-only. See `PLAN.md`.

The assignment brief lives at `docs/take-home-brief.md` — read it before
planning or building. Source doc:
https://docs.google.com/document/d/1vpOHEyQZ6J-UUF5xz7t6YUFMCpVPrnWn18isj7jpIBI/edit

Key constraints from the brief:
- Build something headless / agentic / conversational on the Mercury API (CLI, MCP, etc.) — the UI is not the point.
- Target audience is Mercury's most ambitious API customers.
- Sandbox: https://sandbox.mercury.com/signup · API docs: https://docs.mercury.com/docs/welcome · Demo: https://demo.mercury.com
- Note sandbox limitations as you hit them; they're part of the deliverable discussion.
- Timebox is ~2 hours. Quality of thinking > polish or volume.

## Where things are (updated 2026-09-15)
- `PLAN.md` — execution plan for the build. Start here if you're implementing.
- `docs/index.html` — decision memo (what / why / API findings / architecture). Served at `/docs` once the app exists.
- `docs/explainer.html` — Three.js step-through of one conversation across both approval gates.
- `docs/direction.md`, `docs/landscape.md`, `docs/api-friction-log.md` — research behind the decision.
- Guardrails: sandbox only (no production tokens); writes only via `request-*` endpoints; never direct sends. See PLAN.md §6.
- Standing task: log every paper cut in `docs/api-friction-log.md`, tagged `[api]` `[mcp]` `[cli]` `[docs]` `[sandbox]` `[ecosystem]`.
