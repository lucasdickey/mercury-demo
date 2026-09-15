import { describe, expect, it } from "vitest";
import { closeMonth, queueProposal } from "../src/steward";
import { computeCashPosition } from "../src/analyze/cash";
import { billsDue, matchRecipient } from "../src/analyze/ap";
import type { PayProposal, SweepProposal } from "../src/intents";
import { AS_OF, accounts, fakeReader, recipients, transactions } from "./fixtures/sandbox";

describe("cash position", () => {
  it("ignores archived accounts and internal/failed/out-of-window outflows", () => {
    const p = computeCashPosition(accounts, transactions, AS_OF);
    expect(p.operating?.accountId).toBe("acct-checking-1");
    expect(p.byKind).toEqual({ checking: 148_220.14, savings: 60_000 });
    expect(p.avgMonthlyOutflow).toBe(30_000);
    expect(p.floor).toBe(60_000);
  });
  it("honors an explicit floor", () => {
    const p = computeCashPosition(accounts, transactions, AS_OF, { floor: 25_000 });
    expect(p.floor).toBe(25_000);
    expect(p.floorBasis).toBe("set by you");
  });
});

describe("payables", () => {
  it("matches vendors to recipients loosely but never to deleted ones", () => {
    expect(matchRecipient("Acme Hosting", recipients)?.id).toBe("rcp-acme");
    expect(matchRecipient("deel", recipients)?.id).toBe("rcp-deel");
    expect(matchRecipient("Northstar Legal", recipients)).toBeUndefined();
  });
  it("proposes only bills due within the window and flags unmatched vendors", () => {
    const out = billsDue(
      [
        { vendor: "Acme Hosting", amount: 4200, due: "2026-09-18", memo: "hosting" },
        { vendor: "Deel", amount: 18500, due: "2026-09-30", memo: "payroll" },
        { vendor: "Northstar Legal", amount: 3150, due: "2026-09-12", memo: "legal" },
      ],
      recipients,
      "acct-checking-1",
      AS_OF,
    );
    const kinds = out.map((p) => p.kind);
    expect(kinds).toEqual(["pay", "unmatched_bill"]);
    const pay = out[0] as PayProposal;
    expect(pay.requires_approval).toBe(true);
    expect(pay.recipientId).toBe("rcp-acme");
    expect(pay.id).toMatch(/^steward-pay-2026-09-15-[0-9a-f]{16}$/);
  });
});

describe("closeMonth", () => {
  it("produces followups, payments, and a treasury sweep from the fixture org", async () => {
    const report = await closeMonth(fakeReader, { asOf: AS_OF });
    const byKind = Object.groupBy(report.proposals, (p) => p.kind);

    expect(byKind.followup?.map((f) => (f.kind === "followup" ? f.daysLate : 0))).toEqual([15, 6]);
    expect(byKind.pay?.map((p) => (p.kind === "pay" ? p.recipientName : ""))).toEqual(["Acme Hosting, Inc.", "Figma"]);
    expect(byKind.unmatched_bill?.length).toBe(1);

    const sweep = byKind.sweep?.[0] as SweepProposal;
    // 148,220.14 − 60,000 floor − (4,200 + 720) queued = 83,300.14 → floor to 100s
    expect(sweep.amount).toBe(83_300);
    expect(sweep.toKind).toBe("treasury");
    expect(sweep.requires_approval).toBe(true);
  });

  it("is deterministic for the same day (idempotency keys)", async () => {
    const a = await closeMonth(fakeReader, { asOf: AS_OF });
    const b = await closeMonth(fakeReader, { asOf: AS_OF });
    expect(a.proposals.map((p) => p.id)).toEqual(b.proposals.map((p) => p.id));
  });
});

describe("queueProposal", () => {
  it("only ever calls request-* endpoints, with the proposal id as idempotencyKey", async () => {
    const calls: string[] = [];
    const proposer = {
      environment: "sandbox" as const,
      requestSendMoney: async (accountId: string, body: { idempotencyKey: string }) => {
        calls.push(`send:${accountId}:${body.idempotencyKey}`);
        return { requestId: "smr-1", status: "pendingApproval" as const } as never;
      },
      requestTransferMoney: async (body: { idempotencyKey: string }) => {
        calls.push(`transfer:${body.idempotencyKey}`);
        return { requestId: "tmr-1", status: "pendingApproval" as const } as never;
      },
      listSendMoneyApprovalRequests: async () => [],
    };
    const report = await closeMonth(fakeReader, { asOf: AS_OF });
    const pay = report.proposals.find((p) => p.kind === "pay") as PayProposal;
    const sweep = report.proposals.find((p) => p.kind === "sweep") as SweepProposal;

    const r1 = await queueProposal(proposer, pay);
    const r2 = await queueProposal(proposer, sweep);
    expect(calls).toEqual([`send:acct-checking-1:${pay.id}`, `transfer:${sweep.id}`]);
    expect(r1.status).toBe("pendingApproval");
    expect(r2.next).toMatch(/Approvals/);
  });
});
