import { describe, expect, it, vi } from "vitest";

const balanceState = vi.hoisted(() => ({
  reserveError: null as Error | null,
  commitError: null as Error | null,
  releaseError: null as Error | null,
  cashOutError: null as Error | null,
  contributionError: null as Error | null,
  settleError: null as Error | null,
  cancelError: null as Error | null,
}));

const fakeClient = {
  ReserveForBuyIn: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    if (balanceState.reserveError) {
      callback(balanceState.reserveError, {} as unknown);
      return;
    }
    callback(null, { ok: true, reservation_id: "res-1", available_balance: "500" });
  }),
  CommitReservation: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    if (balanceState.commitError) {
      callback(balanceState.commitError, {} as unknown);
      return;
    }
    callback(null, { ok: true, transaction_id: "tx-1", new_balance: "450" });
  }),
  ReleaseReservation: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    if (balanceState.releaseError) {
      callback(balanceState.releaseError, {} as unknown);
      return;
    }
    callback(null, { ok: true });
  }),
  ProcessCashOut: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    if (balanceState.cashOutError) {
      callback(balanceState.cashOutError, {} as unknown);
      return;
    }
    callback(null, { ok: true, transaction_id: "tx-2", new_balance: "600" });
  }),
  RecordContribution: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    if (balanceState.contributionError) {
      callback(balanceState.contributionError, {} as unknown);
      return;
    }
    callback(null, { ok: true, total_pot: "20", seat_contribution: "10" });
  }),
  SettlePot: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    if (balanceState.settleError) {
      callback(balanceState.settleError, {} as unknown);
      return;
    }
    callback(null, {
      ok: true,
      results: [{ account_id: "player-1", transaction_id: "tx-3", amount: "10", new_balance: "610" }],
    });
  }),
  CancelPot: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    if (balanceState.cancelError) {
      callback(balanceState.cancelError, {} as unknown);
      return;
    }
    callback(null, { ok: true });
  }),
};

vi.mock("@grpc/grpc-js", () => ({
  credentials: { createInsecure: () => ({}) },
  loadPackageDefinition: () => ({
    balance: {
      BalanceService: class {
        constructor() {
          return fakeClient;
        }
      },
    },
  }),
}));

vi.mock("@grpc/proto-loader", () => ({
  loadSync: () => ({}),
}));

vi.mock("../../src/observability/logger", () => ({
  default: { error: vi.fn() },
}));

describe("balance client", () => {
  it("maps successful responses from Balance gRPC", async () => {
    const client = await import("../../src/clients/balanceClient");

    const reserve = await client.reserveForBuyIn("player-1", "table-1", 50, "key-1");
    expect(reserve.ok).toBe(true);
    expect(reserve.reservationId).toBe("res-1");
    expect(reserve.availableBalance).toBe(500);

    const commit = await client.commitReservation("res-1");
    expect(commit.ok).toBe(true);
    expect(commit.transactionId).toBe("tx-1");
    expect(commit.newBalance).toBe(450);

    const release = await client.releaseReservation("res-1", "timeout");
    expect(release.ok).toBe(true);

    const cashOut = await client.processCashOut("player-1", "table-1", 0, 20, "key-2");
    expect(cashOut.ok).toBe(true);
    expect(cashOut.newBalance).toBe(600);

    const contribution = await client.recordContribution("table-1", "hand-1", 0, "player-1", 10, "BET", "key-3");
    expect(contribution.ok).toBe(true);
    expect(contribution.totalPot).toBe(20);

    const settle = await client.settlePot(
      "table-1",
      "hand-1",
      [{ seatId: 0, accountId: "player-1", amount: 10 }],
      "key-4",
    );
    expect(settle.ok).toBe(true);
    expect(settle.results?.[0].newBalance).toBe(610);

    const cancel = await client.cancelPot("table-1", "hand-1", "table_disbanded");
    expect(cancel.ok).toBe(true);
  });

  it("returns internal errors when gRPC fails", async () => {
    const client = await import("../../src/clients/balanceClient");
    balanceState.reserveError = new Error("fail");
    balanceState.commitError = new Error("fail");
    balanceState.releaseError = new Error("fail");
    balanceState.cashOutError = new Error("fail");
    balanceState.contributionError = new Error("fail");
    balanceState.settleError = new Error("fail");
    balanceState.cancelError = new Error("fail");

    const reserve = await client.reserveForBuyIn("player-1", "table-1", 50, "key-1");
    expect(reserve.ok).toBe(false);
    expect(reserve.error).toBe("INTERNAL_ERROR");

    const commit = await client.commitReservation("res-1");
    expect(commit.ok).toBe(false);

    const release = await client.releaseReservation("res-1", "timeout");
    expect(release.ok).toBe(false);

    const cashOut = await client.processCashOut("player-1", "table-1", 0, 20, "key-2");
    expect(cashOut.ok).toBe(false);

    const contribution = await client.recordContribution("table-1", "hand-1", 0, "player-1", 10, "BET", "key-3");
    expect(contribution.ok).toBe(false);

    const settle = await client.settlePot(
      "table-1",
      "hand-1",
      [{ seatId: 0, accountId: "player-1", amount: 10 }],
      "key-4",
    );
    expect(settle.ok).toBe(false);

    const cancel = await client.cancelPot("table-1", "hand-1", "table_disbanded");
    expect(cancel.ok).toBe(false);
  });
});
