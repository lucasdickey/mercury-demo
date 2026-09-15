"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import { CloseReport, type Proposal } from "@steward/core";
import { ProposalCard } from "./components/ProposalCard";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function Home() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({ transport: new DefaultChatTransport({ api: "/api/chat" }) });
  const busy = status === "submitted" || status === "streaming";

  return (
    <main className="page">
      <header className="masthead">
        <span className="eyebrow">Steward · sandbox</span>
        <h1>Month-end close, proposed — never executed</h1>
        <p className="dek">
          Same engine as the MCP server. Ask for the close; approve what you want queued. Everything runs against a Mercury sandbox org.{" "}
          <a href="/docs/index.html">Why this exists ↗</a>
        </p>
      </header>

      <section className="thread">
        {messages.length === 0 ? (
          <div className="starters">
            {["Run month-end close.", "What's our cash position?", "Which invoices are overdue?"].map((s) => (
              <button key={s} onClick={() => sendMessage({ text: s })} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.parts.map((part, i) => {
              if (part.type === "text") return <p key={i}>{part.text}</p>;
              if (part.type === "tool-close_month" && part.state === "output-available") {
                const report = CloseReport.safeParse(part.output);
                if (!report.success) return null;
                return <Report key={i} report={report.data} />;
              }
              if (part.type === "tool-cash_position" && part.state === "output-available") {
                return (
                  <pre key={i} className="draft">
                    {JSON.stringify(part.output, null, 2)}
                  </pre>
                );
              }
              if (part.type.startsWith("tool-") && "state" in part && part.state !== "output-available") {
                return (
                  <p key={i} className="muted">
                    Reading Mercury…
                  </p>
                );
              }
              return null;
            })}
          </div>
        ))}
      </section>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Steward…" disabled={busy} aria-label="Message" />
        <button className="primary" type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}

function Report({ report }: { report: CloseReport }) {
  const p = report.position;
  const groups = Object.groupBy(report.proposals, (x: Proposal) => x.kind);
  return (
    <div className="report">
      <div className="position">
        {Object.entries(p.byKind).map(([kind, amt]) => (
          <div key={kind} className="tile">
            <span className="k">{kind}</span>
            <span className="v">{usd(amt)}</span>
          </div>
        ))}
        <div className="tile floor">
          <span className="k">operating floor</span>
          <span className="v">{usd(p.floor)}</span>
          <span className="d">{p.floorBasis}</span>
        </div>
      </div>
      {(["followup", "pay", "unmatched_bill", "sweep"] as const).map((kind) =>
        groups[kind]?.length ? (
          <div key={kind} className="group">
            <h2>{{ followup: "Overdue receivables", pay: "Bills due", unmatched_bill: "Needs a recipient", sweep: "Surplus" }[kind]}</h2>
            {groups[kind]!.map((prop) => (
              <ProposalCard key={prop.id} proposal={prop} />
            ))}
          </div>
        ) : null,
      )}
      {report.notes.length ? (
        <ul className="notes">
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
