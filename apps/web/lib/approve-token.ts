import { createHmac, timingSafeEqual } from "node:crypto";
import { Proposal } from "@steward/core";
import { requireEnv } from "./mercury";

/**
 * Signed, expiring link payload for /approve/[token] — the fallback gate for
 * MCP clients that can't render elicitation (Claude.ai, ChatGPT, Grok).
 * The proposal travels inside the token, so the approve page is stateless.
 */
const TTL_SECONDS = 15 * 60;

export function signApproveToken(proposal: Proposal, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ p: proposal, exp: Math.floor(now / 1000) + TTL_SECONDS })).toString("base64url");
  const mac = createHmac("sha256", requireEnv("STATE_SECRET", 32)).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyApproveToken(token: string, now = Date.now()): { ok: true; proposal: Proposal } | { ok: false; reason: "malformed" | "mac" | "expired" | "invalid" } {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", requireEnv("STATE_SECRET", 32)).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "mac" };
  let parsed: { p: unknown; exp: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.exp * 1000 < now) return { ok: false, reason: "expired" };
  const proposal = Proposal.safeParse(parsed.p);
  if (!proposal.success) return { ok: false, reason: "invalid" };
  return { ok: true, proposal: proposal.data };
}

export function approveUrl(proposal: Proposal): string {
  const base = process.env.PUBLIC_BASE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base}/approve/${signApproveToken(proposal)}`;
}
