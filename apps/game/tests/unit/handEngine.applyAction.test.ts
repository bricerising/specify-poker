import { describe, expect, it } from "vitest";
import { applyAction, startHand } from "../../src/engine/handEngine";
import { TableConfig, TableState } from "../../src/domain/types";

const config: TableConfig = {
  smallBlind: 1,
  bigBlind: 2,
  ante: 0,
  maxPlayers: 2,
  startingStack: 100,
  turnTimerSeconds: 20,
};

const makeDeck = () => {
  const suits = ["hearts", "diamonds", "clubs", "spades"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  return deck;
};

const createTableState = (): TableState => ({
  tableId: "table-1",
  seats: [
    { seatId: 0, userId: "player-1", stack: 100, status: "SEATED", holeCards: null },
    { seatId: 1, userId: "player-2", stack: 100, status: "SEATED", holeCards: null },
  ],
  spectators: [],
  hand: null,
  button: 0,
  version: 0,
  updatedAt: new Date().toISOString(),
});

describe("handEngine applyAction", () => {
  it("completes the hand when a player folds", () => {
    const started = startHand(createTableState(), config, {
      deck: makeDeck(),
      now: () => "2026-01-01T00:00:00.000Z",
    });

    const foldSeat = started.hand?.turn ?? 0;
    const result = applyAction(started, foldSeat, { type: "FOLD" }, { now: () => "2026-01-01T00:00:01.000Z" });

    expect(result.accepted).toBe(true);
    expect(result.handComplete).toBe(true);
    expect(result.state.hand?.endedAt).toBe("2026-01-01T00:00:01.000Z");
    expect(result.state.seats.every((seat) => seat.status === "SEATED" || seat.status === "EMPTY")).toBe(true);
  });

  it("advances the street after calling the big blind", () => {
    const started = startHand(createTableState(), config, {
      deck: makeDeck(),
      now: () => "2026-01-01T00:00:00.000Z",
    });

    const callerSeatId = started.hand?.turn ?? 0;
    const result = applyAction(started, callerSeatId, { type: "CALL" }, { now: () => "2026-01-01T00:00:01.000Z" });

    expect(result.accepted).toBe(true);
    expect(result.state.hand?.street).toBe("FLOP");
    expect(result.state.hand?.communityCards.length).toBe(3);
  });

  it("allows disconnected seats to fold when allowed", () => {
    const started = startHand(createTableState(), config, {
      deck: makeDeck(),
      now: () => "2026-01-01T00:00:00.000Z",
    });

    const seatId = started.hand?.turn ?? 0;
    const seat = started.seats[seatId];
    seat.status = "DISCONNECTED";

    const result = applyAction(
      started,
      seatId,
      { type: "FOLD" },
      { now: () => "2026-01-01T00:00:01.000Z", allowInactive: true },
    );

    expect(result.accepted).toBe(true);
    expect(result.handComplete).toBe(true);
    expect(result.state.seats[seatId].status).toBe("SEATED");
  });
});
