import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Bill } from "@steward/core";

/**
 * Bills due come from outside Mercury (no Bill Pay API, friction log #29).
 * `npm run demo:prep` writes a demo set dated relative to today; without it,
 * closeMonth falls back to the static catalog in @steward/core.
 * Read per call so re-running prep doesn't need a server restart.
 */
export function loadBills(): Bill[] | undefined {
  const file = resolve(process.cwd(), process.env.STEWARD_BILLS_FILE ?? "../../.demo/bills.json");
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Bill[];
  } catch {
    return undefined;
  }
}
