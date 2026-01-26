import { describe, expect, it } from "vitest";

import { Table, TableState } from "../../src/domain/types";
import { buildTableStateView, redactTableState } from "../../src/services/table/tableViewBuilder";

describe("tableViewBuilder", () => {
  const table: Table = {
    tableId: "table-1",
    name: "Test Table",
    ownerId: "owner-1",
    config: {
      smallBlind: 1,
      bigBlind: 2,
      ante: 0,
      maxPlayers: 2,
      startingStack: 200,
      turnTimerSeconds: 20,
    },
    status: "WAITING",
    createdAt: new Date().toISOString(),
  };

  const state: TableState = {
    tableId: table.tableId,
    seats: [
      {
        seatId: 0,
        userId: "user-1",
        stack: 0,
        status: "RESERVED",
        holeCards: [
          { rank: "A", suit: "spades" },
          { rank: "K", suit: "hearts" },
        ],
        reservationId: "reservation-1",
        pendingBuyInAmount: 200,
        buyInIdempotencyKey: "buyin-key-1",
        lastAction: new Date().toISOString(),
      },
      { seatId: 1, userId: null, stack: 0, status: "EMPTY", holeCards: null },
    ],
    spectators: [],
    hand: null,
    button: 0,
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  it("does not leak internal seat fields in table broadcasts", () => {
    const view = buildTableStateView(table, state);
    const seatView = view.seats[0] as Record<string, unknown>;

    expect(seatView.holeCards).toBeNull();
    expect(seatView).not.toHaveProperty("reservationId");
    expect(seatView).not.toHaveProperty("pendingBuyInAmount");
    expect(seatView).not.toHaveProperty("buyInIdempotencyKey");
  });

  it("redacts internal fields when returning table state", () => {
    const redacted = redactTableState(state);
    const seatView = redacted.seats[0] as Record<string, unknown>;

    expect(seatView.holeCards).toBeNull();
    expect(seatView).not.toHaveProperty("reservationId");
    expect(seatView).not.toHaveProperty("pendingBuyInAmount");
    expect(seatView).not.toHaveProperty("buyInIdempotencyKey");
  });
});

