"use server";

import { PayProposal, SweepProposal, queueProposal, type QueueOutcome } from "@steward/core";
import { mercury } from "@/lib/mercury";
import { verifyApproveToken } from "@/lib/approve-token";

/**
 * Gate 1 for the surfaces we own: the Approve button on a proposal card and
 * the /approve/[token] page. Both end in the same request-* call, so gate 2
 * (Mercury's approval queue) still applies.
 */
export async function approveProposal(proposal: unknown): Promise<QueueOutcome> {
  const pay = PayProposal.safeParse(proposal);
  if (pay.success) return queueProposal(mercury(), pay.data);
  return queueProposal(mercury(), SweepProposal.parse(proposal));
}

export async function approveFromToken(token: string): Promise<QueueOutcome | { error: string }> {
  const v = verifyApproveToken(token);
  if (!v.ok) return { error: `This approve link is ${v.reason === "expired" ? "expired" : "invalid"}. Ask Steward for a fresh one.` };
  if (v.proposal.kind !== "pay" && v.proposal.kind !== "sweep") return { error: "Nothing to queue for this proposal." };
  return queueProposal(mercury(), v.proposal);
}
