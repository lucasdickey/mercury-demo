import { createHash } from "node:crypto";

/**
 * Deterministic proposal id. Same inputs on the same day → same id, which is
 * what we want for Mercury's `idempotencyKey`: re-running close_month and
 * approving twice must not queue the same payment twice.
 */
export function stableId(kind: string, key: string, asOf: Date): string {
  const day = asOf.toISOString().slice(0, 10);
  const h = createHash("sha256").update(`${kind}|${key}|${day}`).digest("hex").slice(0, 16);
  return `steward-${kind}-${day}-${h}`;
}
