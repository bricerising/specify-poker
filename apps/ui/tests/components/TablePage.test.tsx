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
        bettingStructure: "NoLimit",
      },
      seats: [{ seatId: 0, userId: "u1", stack: 95, status: "active" }],
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
      version: 1,
    },
    seatId: 0,
    status: "connected",
    chatMessages: [],
  }),
  subscribe: () => () => {},
  fetchTables: async () => {},
  joinSeat: async () => {},
  subscribeTable: () => {},
  sendAction: () => {},
  subscribeChat: () => {},
  sendChat: () => {},
};

describe("TablePage", () => {
  it("renders table snapshot", () => {
    const html = renderToString(<TablePage store={mockStore} />);
    expect(html).toContain("Test Table");
    expect(html).toContain("Board: AS KS QS");
  });
});
