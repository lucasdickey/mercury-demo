"use server";

import { queueProposal, type QueueOutcome } from "@steward/core";
import { mercury } from "@/lib/mercury";
import { verifyApproveToken } from "@/lib/approve-token";

/**
 * Gate 1 for clients that can't render an approval: the /approve/[token] page.
 * It ends in the same request-* call, so gate 2 (Mercury's approval queue) still
 * applies.
 */
export async function approveFromToken(token: string): Promise<QueueOutcome | { error: string }> {
  const v = verifyApproveToken(token);
  if (!v.ok) return { error: `This approve link is ${v.reason === "expired" ? "expired" : "invalid"}. Ask Steward for a fresh one.` };
  if (v.proposal.kind !== "pay" && v.proposal.kind !== "sweep") return { error: "Nothing to queue for this proposal." };
  return queueProposal(mercury(), v.proposal);
}
