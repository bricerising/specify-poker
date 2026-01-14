import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LobbyPage } from "../../src/pages/LobbyPage";

const mockStore = {
  getState: () => ({
    tables: [],
    tableState: null,
    seatId: null,
    isSpectating: false,
    status: "idle" as const,
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

describe("LobbyPage", () => {
  it("renders lobby and create form", () => {
    const html = renderToString(<LobbyPage store={mockStore} />);
    expect(html).toContain("Lobby");
    expect(html).toContain("Create Table");
  });
});
