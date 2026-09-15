import { describe, expect, it } from "vitest";
import { MercuryClient, PRODUCTION_BASE_URL, redact } from "../src/mercury/client";

const TOKEN = "secret-token:mercury_sandbox_test_yrucrem";

describe("MercuryClient guardrails", () => {
  it("refuses production unless explicitly allowed", () => {
    expect(() => new MercuryClient({ token: TOKEN, baseUrl: PRODUCTION_BASE_URL })).toThrow(/sandbox-only/);
    expect(new MercuryClient({ token: TOKEN, baseUrl: PRODUCTION_BASE_URL, allowProduction: true }).environment).toBe("production");
    expect(new MercuryClient({ token: TOKEN }).environment).toBe("sandbox");
  });
  it("strips account and routing numbers recursively", () => {
    const out = redact({ id: "a", accountNumber: "123", nested: [{ routingNumber: "9", keep: 1 }] });
    expect(out).toEqual({ id: "a", nested: [{ keep: 1 }] });
  });
});

describe("pagination", () => {
  it("follows page.nextPage with start_after and stops at the end", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: URL | string) => {
      const u = new URL(String(url));
      seen.push(u.searchParams.get("start_after") ?? "<first>");
      const page = seen.length;
      const body =
        page === 1
          ? { accounts: [{ id: "a1", accountNumber: "x" }], page: { nextPage: "a1" } }
          : { accounts: [{ id: "a2" }], page: { nextPage: null } };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const client = new MercuryClient({ token: TOKEN, fetch: fetchImpl });
    const accounts = await client.listAccounts();
    expect(seen).toEqual(["<first>", "a1"]);
    expect(accounts).toEqual([{ id: "a1" }, { id: "a2" }]);
  });
  it("surfaces Mercury's prose errors with status and path", async () => {
    const fetchImpl = (async () => new Response("Invalid `start_after`", { status: 400 })) as typeof fetch;
    const client = new MercuryClient({ token: TOKEN, fetch: fetchImpl });
    await expect(client.listAccounts()).rejects.toThrow(/GET \/accounts → 400: Invalid/);
  });
});
