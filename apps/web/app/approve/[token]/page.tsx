import { verifyApproveToken } from "@/lib/approve-token";
import { ProposalCard } from "@/app/components/ProposalCard";

/**
 * Fallback gate 1: MCP clients that can't render elicitation (Claude.ai,
 * ChatGPT, Grok) hand the user this link. Approving here queues the proposal
 * in Mercury exactly as the in-chat form would.
 */
export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyApproveToken(token);

  return (
    <main className="page narrow">
      <header className="masthead">
        <span className="eyebrow">Steward · approval</span>
        <h1>{v.ok ? "Approve this proposal?" : "This link doesn't work"}</h1>
        <p className="dek">
          {v.ok
            ? "Approving queues it in Mercury's approval queue. Nothing moves until it's approved there too."
            : v.reason === "expired"
              ? "Approve links expire after 15 minutes. Ask Steward for a fresh one."
              : "The link is malformed or was signed with a different secret."}
        </p>
      </header>
      {v.ok && (v.proposal.kind === "pay" || v.proposal.kind === "sweep") ? <ProposalCard proposal={v.proposal} token={token} /> : null}
    </main>
  );
}
