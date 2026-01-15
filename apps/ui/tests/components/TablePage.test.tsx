import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TablePage } from "../../src/pages/TablePage";

const mockStore = {
  getState: () => ({
    tables: [],
    tableState: {
      tableId: "table-1",
      name: "Test Table",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 2,
        startingStack: 100,
        bettingStructure: "NoLimit" as const,
      },
      seats: [{ seatId: 0, userId: "u1", stack: 95, status: "active" }],
      spectators: [],
      status: "in_hand",
      hand: {
        handId: "hand-1",
        currentStreet: "flop",
        currentTurnSeat: 0,
        currentBet: 10,
        minRaise: 10,
        raiseCapped: false,
        roundContributions: { 0: 10 },
        actedSeats: [0],
        communityCards: ["AS", "KS", "QS"],
        pots: [{ amount: 20, eligibleSeatIds: [0] }],
        actionTimerDeadline: null,
        bigBlind: 10,
      },
      button: 0,
      version: 1,
    },
    seatId: 0,
    isSpectating: false,
    status: "connected" as const,
    chatMessages: [],
    privateHoleCards: null,
    privateHandId: null,
  }),
  subscribe: () => () => {},
  fetchTables: async () => {},
  subscribeLobby: () => {},
  joinSeat: async () => {},
  spectateTable: () => {},
  leaveTable: () => {},
  subscribeTable: () => {},
  sendAction: () => {},
  subscribeChat: () => {},
  sendChat: () => {},
};

describe("TablePage", () => {
  it("renders table snapshot", () => {
    const html = renderToString(<TablePage store={mockStore} />);
    expect(html).toContain("Test Table");
    expect(html).toContain('aria-label="A of spades"');
    expect(html).toContain('aria-label="K of spades"');
    expect(html).toContain('aria-label="Q of spades"');
  });
});
