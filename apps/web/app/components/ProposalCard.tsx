"use client";

import { useState, useTransition } from "react";
import type { Proposal, QueueOutcome } from "@steward/core";
import { approveFromToken } from "@/app/actions";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ProposalCard({ proposal, token }: { proposal: Proposal; token: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<QueueOutcome | { error: string } | { declined: true } | null>(null);
  const needsApproval = proposal.requires_approval && (proposal.kind === "pay" || proposal.kind === "sweep");

  const title =
    proposal.kind === "pay"
      ? `Pay ${proposal.recipientName} ${usd(proposal.amount)}`
      : proposal.kind === "sweep"
        ? `Sweep ${usd(proposal.amount)} ${proposal.fromName} → ${proposal.toName}`
        : proposal.kind === "followup"
          ? `Follow up: ${proposal.customerName ?? proposal.customerId} · ${proposal.invoiceNumber}`
          : `No recipient for ${proposal.vendor}`;

  return (
    <article className={`card kind-${proposal.kind}`} aria-live="polite">
      <div className="card-head">
        <span className={`stamp ${needsApproval ? "approve" : "propose"}`}>{proposal.kind === "unmatched_bill" ? "needs setup" : proposal.kind}</span>
        <h3>{title}</h3>
      </div>
      <p className="why">{proposal.why}</p>
      {proposal.kind === "followup" ? <pre className="draft">{proposal.draft}</pre> : null}

      {needsApproval && !result ? (
        <div className="actions">
          <button
            className="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await approveFromToken(token);
                setResult(r);
              })
            }
          >
            {pending ? "Queueing…" : "Approve — queue in Mercury"}
          </button>
          <button disabled={pending} onClick={() => setResult({ declined: true })}>
            Decline
          </button>
          <span className="hint">Gate 1 of 2. Money moves only after approval in Mercury's dashboard.</span>
        </div>
      ) : null}

      {result && "declined" in result ? <p className="outcome muted">Declined. Nothing was queued.</p> : null}
      {result && "error" in result ? <p className="outcome error">{result.error}</p> : null}
      {result && "notQueued" in result ? (
        <div className="outcome error">
          <strong>Not queued.</strong> {result.message}
          <p>{result.remedy}</p>
        </div>
      ) : null}
      {result && "mercuryRequestId" in result ? (
        <div className="outcome queued">
          <strong>Queued in Mercury ({result.environment})</strong> · request <code>{result.mercuryRequestId}</code> · status <code>{result.status}</code>
          <p>
            {result.next}
            {result.approveUrl ? (
              <>
                {" "}
                <a href={result.approveUrl} target="_blank" rel="noreferrer">
                  Open in Mercury ↗
                </a>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </article>
  );
}
