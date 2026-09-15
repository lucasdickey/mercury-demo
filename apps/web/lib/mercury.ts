import { MercuryClient, SANDBOX_BASE_URL } from "@steward/core";

/**
 * One client per process, sandbox only. There is deliberately no code path
 * that reads a production token (PLAN.md §6).
 */
let client: MercuryClient | null = null;

export function mercury(): MercuryClient {
  if (client) return client;
  const token = process.env.MERCURY_SANDBOX_API_TOKEN;
  if (!token) throw new Error("MERCURY_SANDBOX_API_TOKEN is not set. Create a sandbox token at sandbox.mercury.com → Settings → Tokens.");
  client = new MercuryClient({ token, baseUrl: process.env.MERCURY_BASE_URL ?? SANDBOX_BASE_URL });
  return client;
}

export function requireEnv(name: string, minLength = 1): string {
  const v = process.env[name];
  if (!v || v.length < minLength) throw new Error(`${name} is not set${minLength > 1 ? ` (min ${minLength} chars)` : ""}.`);
  return v;
}
