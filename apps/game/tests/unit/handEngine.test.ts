import { describe, it, expect } from "vitest";
import { startHand } from "../../src/engine/handEngine";
import { TableConfig, TableState } from "../../src/domain/types";

describe("handEngine", () => {
  it("should start a hand correctly", () => {
    const tableConfig: TableConfig = {
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
      maxPlayers: 9,
      startingStack: 1000,
      turnTimerSeconds: 20,
    };
    const tableState: TableState = {
      tableId: "table-1",
      seats: [
        { seatId: 0, userId: "user-1", stack: 1000, status: "SEATED", holeCards: null },
        { seatId: 1, userId: "user-2", stack: 1000, status: "SEATED", holeCards: null },
      ],
      spectators: [],
      hand: null,
      button: 0,
      version: 0,
      updatedAt: new Date().toISOString(),
    };

    const updatedTable = startHand(tableState, tableConfig);

    expect(updatedTable.hand).toBeDefined();
    expect(updatedTable.hand?.street).toBe("PREFLOP");
    expect(updatedTable.seats[0].stack).toBeLessThan(1000);
    expect(updatedTable.seats[1].stack).toBeLessThan(1000);
  });
});
