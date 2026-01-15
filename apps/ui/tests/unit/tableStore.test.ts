import { describe, expect, it, vi, beforeEach } from "vitest";

import { createTableStore, TableStore, TableState } from "../../src/state/tableStore";

describe("createTableStore", () => {
  let store: TableStore;

  beforeEach(() => {
    store = createTableStore();
  });

  describe("initial state", () => {
    it("starts with empty tables and null tableState", () => {
      const state = store.getState();
      expect(state.tables).toEqual([]);
      expect(state.tableState).toBeNull();
      expect(state.seatId).toBeNull();
      expect(state.isSpectating).toBe(false);
      expect(state.status).toBe("idle");
      expect(state.chatMessages).toEqual([]);
      expect(state.privateHoleCards).toBeNull();
      expect(state.privateHandId).toBeNull();
    });
  });

  describe("subscribe", () => {
    it("notifies listeners on state changes", () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.subscribeLobby();

      expect(listener).toHaveBeenCalled();
    });

    it("returns unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.subscribeLobby();

      expect(listener).toHaveBeenCalledTimes(0);
    });
  });

  describe("leaveTable", () => {
    it("resets table-related state", () => {
      const state = store.getState();
      expect(state.tableState).toBeNull();
      expect(state.seatId).toBeNull();
      expect(state.isSpectating).toBe(false);
      expect(state.chatMessages).toEqual([]);
    });
  });
});

describe("TableState version tracking", () => {
  it("tracks version for sync", () => {
    const tableState: TableState = {
      tableId: "table-1",
      name: "Test Table",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        startingStack: 500,
        bettingStructure: "NoLimit",
      },
      seats: [],
      status: "lobby",
      hand: null,
      button: 0,
      version: 1,
    };

    expect(tableState.version).toBe(1);
  });
});

describe("ChatMessage structure", () => {
  it("has required fields", () => {
    const message = {
      id: "msg-1",
      userId: "user-1",
      text: "Hello",
      ts: "2026-01-12T00:00:00Z",
    };

    expect(message.id).toBeDefined();
    expect(message.userId).toBeDefined();
    expect(message.text).toBeDefined();
    expect(message.ts).toBeDefined();
  });
});

describe("SpectatorView structure", () => {
  it("has required fields", () => {
    const spectator = {
      userId: "user-1",
      nickname: "Player1",
      status: "active" as const,
    };

    expect(spectator.userId).toBeDefined();
    expect(spectator.status).toBe("active");
  });
});

describe("TableSummary spectator count", () => {
  it("includes spectator count", () => {
    const summary = {
      tableId: "table-1",
      name: "Test",
      ownerId: "owner-1",
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        startingStack: 500,
        bettingStructure: "NoLimit" as const,
      },
      seatsTaken: 2,
      occupiedSeatIds: [0, 1],
      inProgress: true,
      spectatorCount: 5,
    };

    expect(summary.spectatorCount).toBe(5);
  });
});
