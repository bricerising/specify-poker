import { describe, expect, it } from "vitest";

import { applyAction, startHand } from "../../src/engine/handEngine";
import { TableState } from "../../src/engine/types";

function createTableState(): TableState {
  return {
    tableId: "table-1",
    name: "Unit Table",
    config: {
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: 2,
      startingStack: 100,
      bettingStructure: "NoLimit",
    },
    seats: [
      { seatId: 0, userId: "u1", stack: 100, status: "active" },
      { seatId: 1, userId: "u2", stack: 100, status: "active" },
    ],
    status: "lobby",
    hand: null,
    version: 0,
  };
}

describe("hand engine", () => {
  it("advances streets through showdown", () => {
    const table = createTableState();
    const deck = [
      "AS",
      "KS",
      "QS",
      "JS",
      "TS",
      "9H",
      "8H",
      "7H",
      "6H",
    ];
    const started = startHand(table, { deck, now: () => "2026-01-01T00:00:00.000Z" });

    expect(started.hand?.currentStreet).toBe("preflop");

    let state = applyAction(started, 0, { type: "Call" }).table;
    state = applyAction(state, 1, { type: "Check" }).table;
    expect(state.hand?.currentStreet).toBe("flop");

    state = applyAction(state, state.hand!.currentTurnSeat, { type: "Check" }).table;
    state = applyAction(state, state.hand!.currentTurnSeat, { type: "Check" }).table;
    expect(state.hand?.currentStreet).toBe("turn");

    state = applyAction(state, state.hand!.currentTurnSeat, { type: "Check" }).table;
    state = applyAction(state, state.hand!.currentTurnSeat, { type: "Check" }).table;
    expect(state.hand?.currentStreet).toBe("river");

    state = applyAction(state, state.hand!.currentTurnSeat, { type: "Check" }).table;
    state = applyAction(state, state.hand!.currentTurnSeat, { type: "Check" }).table;

    expect(state.hand?.currentStreet).toBe("ended");
    expect(state.hand?.communityCards.length).toBe(5);
  });
});
