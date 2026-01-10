import { describe, expect, it } from "vitest";

import { calculatePots, deriveLegalActions } from "../../src/engine/actionRules";
import { HandState, TableSeat } from "../../src/engine/types";

function createHand(overrides: Partial<HandState> = {}): HandState {
  return {
    handId: "hand-1",
    tableId: "table-1",
    buttonSeat: 0,
    smallBlindSeat: 0,
    bigBlindSeat: 1,
    communityCards: [],
    pots: [],
    currentStreet: "preflop",
    currentTurnSeat: 0,
    currentBet: 10,
    minRaise: 10,
    raiseCapped: false,
    roundContributions: { 0: 0, 1: 10 },
    totalContributions: { 0: 0, 1: 10 },
    actedSeats: [],
    actionTimerDeadline: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    deck: [],
    holeCards: {},
    bigBlind: 10,
    ...overrides,
  };
}

describe("action rules", () => {
  it("returns call and raise when facing a bet", () => {
    const hand = createHand();
    const seat: TableSeat = { seatId: 0, userId: "u1", stack: 100, status: "active" };

    const actions = deriveLegalActions(hand, seat).map((action) => action.type);
    expect(actions).toContain("Call");
    expect(actions).toContain("Raise");
  });

  it("allows exact min raise amounts", () => {
    const hand = createHand({ currentBet: 10, minRaise: 10, roundContributions: { 0: 0 } });
    const seat: TableSeat = { seatId: 0, userId: "u1", stack: 20, status: "active" };

    const raise = deriveLegalActions(hand, seat).find((action) => action.type === "Raise");
    expect(raise).toEqual({ type: "Raise", minAmount: 20, maxAmount: 20 });
  });

  it("allows short all-in raises when below min raise", () => {
    const hand = createHand({ currentBet: 10, minRaise: 10, roundContributions: { 0: 0 } });
    const seat: TableSeat = { seatId: 0, userId: "u1", stack: 15, status: "active" };

    const raise = deriveLegalActions(hand, seat).find((action) => action.type === "Raise");
    expect(raise).toEqual({ type: "Raise", minAmount: 15, maxAmount: 15 });
  });

  it("blocks raises for seats that already acted after a capped raise", () => {
    const hand = createHand({
      currentBet: 20,
      minRaise: 10,
      raiseCapped: true,
      actedSeats: [0],
      roundContributions: { 0: 10, 1: 20 },
    });
    const seat: TableSeat = { seatId: 0, userId: "u1", stack: 100, status: "active" };

    const raise = deriveLegalActions(hand, seat).find((action) => action.type === "Raise");
    expect(raise).toBeUndefined();
  });

  it("creates side pots based on contributions", () => {
    const pots = calculatePots(
      { 0: 50, 1: 100, 2: 100 },
      new Set([2]),
    );

    expect(pots).toEqual([
      { amount: 150, eligibleSeatIds: [0, 1] },
      { amount: 100, eligibleSeatIds: [1] },
    ]);
  });
});
