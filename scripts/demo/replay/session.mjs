#!/usr/bin/env node
/**
 * Scripted re-enactment of the Claude Code walkthrough.
 *
 *   node scripts/demo/replay/render.mjs   → .demo/replay.cast + .gif + .mp4
 *   node scripts/demo/replay/session.mjs  → play it in this terminal
 *
 * Every figure is real output from a live sandbox run (2026-09-18); nothing here
 * calls Mercury. The screen recording of the real session is the primary
 * artifact — this is the lightweight version for the page and for slides.
 */
export const COLS = 102;
export const ROWS = 36;

const CSI = "[";
const dim = (s) => `${CSI}90m${s}${CSI}0m`;
const bold = (s) => `${CSI}1m${s}${CSI}0m`;
const green = (s) => `${CSI}32m${s}${CSI}0m`;
const amber = (s) => `${CSI}33m${s}${CSI}0m`;
const cyan = (s) => `${CSI}36m${s}${CSI}0m`;

export const SCRIPT = [
  {
    type: "print",
    gap: 60,
    lines: [
      dim("steward MCP connected · 4 tools: cash_position, close_month, propose_payment, propose_sweep"),
      "",
    ],
  },
  { type: "prompt", text: "Run month-end close." },
  {
    type: "print",
    gap: 75,
    lines: [
      dim("steward · close_month (read-only)"),
      "",
      bold("Cash position") + dim("  as of 2026-09-18"),
      "  Evolve Checking ••4124    " + bold("$1,498,754.02") + dim("   operating"),
      "  Mercury Checking ••3996   $922,646.27",
      "  Mercury Savings ••2280    $1,000,000.00",
      dim("  … 6 more accounts · total $7,416,214.20"),
      "  Operating floor           $49,233.88",
      dim("                            2× avg monthly outflow $24,616.94, by posted date"),
      "",
      bold("Bills due this week"),
      "  " + green("pay") + "          Alex Rivera      $1,250.00   due 2026-09-20 · ACH",
      "  " + amber("needs setup") + "  Acme Hosting     $4,200.00   due 2026-09-21 · no saved recipient",
      "  " + amber("needs setup") + "  Northstar Legal  $3,150.00   overdue since 09-14 · no saved recipient",
      "",
      bold("Receivables") + dim("   none — the sandbox has no invoices, and this token can't create them"),
      "",
      bold("Surplus"),
      "  " + green("sweep") + "        $1,448,200.00   Evolve Checking ••4124 → Mercury Savings ••2280",
      "",
      dim("Nothing is queued."),
      "",
    ],
  },
  { type: "prompt", text: "Pay the Alex Rivera bill." },
  {
    type: "print",
    gap: 70,
    lines: [
      dim("steward · propose_payment"),
      "",
      bold("MCP server “steward” requests your input"),
      "",
      "Queue $1,250 ACH to Alex Rivera for approval in Mercury? (Contract design work)",
      "",
      "  approve:  " + cyan("› queue it"),
      dim("              cancel"),
      "",
    ],
  },
  { type: "wait", ms: 1300 },
  { type: "print", gap: 220, lines: [green("  ✓ queue it"), ""] },
  {
    type: "print",
    gap: 90,
    lines: [
      dim("steward · POST /account/…/request-send-money"),
      "",
      "  " + green("pendingApproval") + "  request 84e78534-b225-11f1-9548-838448c0f9ef",
      "  A second approver in your org approves the ACH to Alex Rivera in Mercury →",
      "  Payments → Needs Approval. " + bold("Nothing has moved yet."),
      "  " + cyan("https://sandbox.mercury.com/payments/approvals?requestId=84e78534…"),
      "",
    ],
  },
  { type: "prompt", text: "Sweep the surplus to savings." },
  {
    type: "print",
    gap: 70,
    lines: [
      dim("steward · propose_sweep"),
      "",
      bold("MCP server “steward” requests your input"),
      "",
      "Queue a $1,448,200 transfer Evolve Checking ••4124 → Mercury Savings ••2280?",
      "",
      "  approve:  " + cyan("› queue it"),
      dim("              cancel"),
      "",
    ],
  },
  { type: "wait", ms: 1100 },
  { type: "print", gap: 220, lines: [green("  ✓ queue it"), ""] },
  {
    type: "print",
    gap: 90,
    lines: [
      dim("steward · POST /request-transfer"),
      "",
      "  " + amber("not queued") + "  Mercury didn't queue this transfer: this API token can't request",
      "              transfers. Mercury's scopes include “Send Money with Approval”",
      "              but nothing for transfers.",
      "",
      "  Make the transfer yourself in Mercury → Transfer: Evolve Checking ••4124 →",
      "  Mercury Savings ••2280, $1,448,200. " + bold("Nothing was created."),
      "",
      dim("  friction log #41 — no Custom-token scope exists for request-transfer"),
      "",
      dim("Two gates, every time: you approve here, a teammate approves in Mercury."),
      "",
    ],
  },
  { type: "wait", ms: 2500 },
];

// Played directly: same beats, in this terminal.
if (import.meta.url === `file://${process.argv[1]}`) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const beat of SCRIPT) {
    if (beat.type === "print") {
      for (const line of beat.lines) {
        process.stdout.write(line + "\n");
        await sleep(beat.gap ?? 70);
      }
    } else if (beat.type === "prompt") {
      process.stdout.write("> ");
      await sleep(500);
      for (const ch of beat.text) {
        process.stdout.write(ch);
        await sleep(beat.speed ?? 45);
      }
      await sleep(450);
      process.stdout.write("\n");
    } else if (beat.type === "wait") {
      await sleep(beat.ms);
    }
  }
}
