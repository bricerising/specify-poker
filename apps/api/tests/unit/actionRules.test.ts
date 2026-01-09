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
