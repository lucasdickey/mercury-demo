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

## Where things are (updated 2026-09-17)
- `PLAN.md` — execution plan, status, and the demo script (§5). Start here. Built and run live in Claude Code; presenting Fri 2026-09-18.
- `docs/index.html` — decision memo (what / why / API findings / architecture), with the walkthrough video. Served at `/docs` (site root redirects there): https://mercury-demo.one-off.dev, password-gated (`STEWARD_PASSWORD`).
- `docs/narrative.md` / `docs/narrative.html` — the walkthrough story; the HTML embeds the video. Keep the two in step by hand.
- `docs/explainer.html` — Three.js step-through of one conversation across both approval gates.
- `docs/*.html` for `PLAN.md` and the `docs/*.md` pages listed in `render-docs.mjs` (not `narrative.md`; not the research files `direction.md`, `landscape.md`, `sandbox-surface.md`, which stay Markdown-only) are **generated** by `apps/web/scripts/render-docs.mjs` (`npm run docs`, also runs before dev/build). Edit the Markdown, not the HTML. `index.html`, `narrative.html`, `explainer.html` are hand-built. Site root redirects to `/docs/index.html`; the web chat UI was removed 2026-09-17.
- `docs/findings.md` — **ranked BLUF** of the friction log; update it when the log grows.
- `docs/api-friction-log.md` — the numbered friction log (75 entries). `docs/direction.md`, `docs/landscape.md`, `docs/sandbox-surface.md` — research behind the decision (repo only, not on the site).
- Guardrails: sandbox only (no production tokens); writes only via `request-*` endpoints; never direct sends. See PLAN.md §6.
- Standing task: log every paper cut in `docs/api-friction-log.md`, tagged `[api]` `[mcp]` `[cli]` `[docs]` `[sandbox]` `[ecosystem]`.
