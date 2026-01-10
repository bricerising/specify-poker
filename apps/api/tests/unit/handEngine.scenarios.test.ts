import { describe, expect, it } from "vitest";

import { applyAction, startHand } from "../../src/engine/handEngine";
import { HandActionInput, TableState } from "../../src/engine/types";

function createTableState(seats: Array<{ userId: string; stack: number }>): TableState {
  return {
    tableId: "table-scenarios",
    name: "Scenario Table",
    ownerId: "owner-1",
    config: {
      smallBlind: 5,
      bigBlind: 10,
      maxPlayers: seats.length,
      startingStack: seats[0]?.stack ?? 100,
      bettingStructure: "NoLimit",
    },
    seats: seats.map((seat, seatId) => ({
      seatId,
      userId: seat.userId,
      stack: seat.stack,
      status: "active" as const,
    })),
    status: "lobby",
    hand: null,
    version: 0,
  };
}

function act(table: TableState, action: HandActionInput) {
  const seatId = table.hand?.currentTurnSeat ?? 0;
  const result = applyAction(table, seatId, action);
  expect(result.accepted).toBe(true);
  return result.table;
}

describe("hand engine scenarios", () => {
  it("plays a multiway raised hand to showdown and awards the winner", () => {
    const table = createTableState([
      { userId: "u1", stack: 500 },
      { userId: "u2", stack: 500 },
      { userId: "u3", stack: 500 },
    ]);
    const deck = ["2C", "2D", "AH", "KH", "9S", "9C", "KD", "7H", "4S", "3C", "8D"];

    let state = startHand(table, { deck, now: () => "2026-01-01T00:00:00.000Z" });

    state = act(state, { type: "Raise", amount: 30 });
    state = act(state, { type: "Call" });
    state = act(state, { type: "Call" });
    expect(state.hand?.currentStreet).toBe("flop");

    state = act(state, { type: "Bet", amount: 20 });
    state = act(state, { type: "Call" });
    state = act(state, { type: "Raise", amount: 60 });
    state = act(state, { type: "Call" });
    state = act(state, { type: "Fold" });
    expect(state.hand?.currentStreet).toBe("turn");

    state = act(state, { type: "Check" });
    state = act(state, { type: "Bet", amount: 80 });
    state = act(state, { type: "Call" });
    expect(state.hand?.currentStreet).toBe("river");

    state = act(state, { type: "Check" });
    state = act(state, { type: "Check" });

    expect(state.hand?.currentStreet).toBe("ended");
    expect(state.hand?.communityCards).toHaveLength(5);
    expect(state.hand?.winners).toEqual([1]);
    expect(state.seats[1].stack).toBe(720);
    expect(state.status).toBe("lobby");
  });

  it("handles preflop all-in and resolves showdown payouts", () => {
    const table = createTableState([
      { userId: "short", stack: 20 },
      { userId: "deep", stack: 100 },
    ]);
    const deck = ["AS", "AD", "KH", "QH", "2C", "7D", "9S", "3C", "8D"];

    let state = startHand(table, { deck, now: () => "2026-01-01T00:00:00.000Z" });
    state = act(state, { type: "Raise", amount: 20 });

    expect(state.hand?.currentStreet).toBe("ended");
    expect(state.hand?.winners).toEqual([0]);
    expect(state.seats[0].stack).toBe(30);
    expect(state.seats[1].stack).toBe(90);
    expect(state.status).toBe("lobby");
  });

  it("awards the pot when the field folds on the flop", () => {
    const table = createTableState([
      { userId: "u1", stack: 100 },
      { userId: "u2", stack: 100 },
      { userId: "u3", stack: 100 },
    ]);
    const deck = ["8C", "8D", "QH", "JD", "2S", "3S", "AC", "5H", "9D"];

    let state = startHand(table, { deck, now: () => "2026-01-01T00:00:00.000Z" });
    state = act(state, { type: "Call" });
    state = act(state, { type: "Call" });
    state = act(state, { type: "Check" });
    expect(state.hand?.currentStreet).toBe("flop");

    const flopBettor = state.hand?.currentTurnSeat ?? 0;
    state = act(state, { type: "Bet", amount: 20 });
    state = act(state, { type: "Fold" });
    state = act(state, { type: "Fold" });

    expect(state.hand?.currentStreet).toBe("ended");
    expect(state.hand?.winners).toEqual([flopBettor]);
    expect(state.seats[flopBettor].stack).toBe(120);
    state.seats.forEach((seat, seatId) => {
      if (seatId !== flopBettor) {
        expect(seat.stack).toBe(90);
      }
    });
    expect(state.status).toBe("lobby");
  });
});
