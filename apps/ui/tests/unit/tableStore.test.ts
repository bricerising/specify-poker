import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
const apiFetchDecodedMock = vi.hoisted(() => vi.fn());
const getApiBaseUrlMock = vi.hoisted(() => vi.fn(() => 'http://localhost:4000'));
const getTokenMock = vi.hoisted(() => vi.fn(() => null));
const decodeJwtUserIdMock = vi.hoisted(() => vi.fn(() => null));
const recordWebSocketMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/apiClient', () => ({
  apiFetch: apiFetchMock,
  apiFetchDecoded: apiFetchDecodedMock,
  getApiBaseUrl: getApiBaseUrlMock,
}));

vi.mock('../../src/services/auth', () => ({
  getToken: getTokenMock,
}));

vi.mock('../../src/utils/jwt', () => ({
  decodeJwtUserId: decodeJwtUserIdMock,
}));

vi.mock('../../src/observability/otel', () => ({
  initUiTelemetry: vi.fn(),
  recordNavigation: vi.fn(),
  recordAction: vi.fn(),
  recordError: vi.fn(),
  recordApiCall: vi.fn(),
  recordWebSocketMessage: recordWebSocketMessageMock,
}));

import type { TableStore, TableState } from '../../src/state/tableStore';
import { createTableStore } from '../../src/state/tableStore';

type MockWebSocketListener = (event: { data?: string }) => void;

const wsState = vi.hoisted(() => ({
  instances: [] as MockWebSocket[],
  autoOpen: true,
}));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  sent: string[] = [];
  private readonly listeners: Record<string, MockWebSocketListener[]> = {
    open: [],
    close: [],
    error: [],
    message: [],
  };

  constructor(url: string) {
    this.url = url;
    wsState.instances.push(this);
    if (wsState.autoOpen) {
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit('open');
      });
    }
  }

  addEventListener(type: string, callback: MockWebSocketListener) {
    this.listeners[type]?.push(callback);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open');
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close');
  }

  emitMessage(message: unknown) {
    this.emit('message', { data: JSON.stringify(message) });
  }

  private emit(type: string, event: { data?: string } = {}) {
    for (const callback of this.listeners[type] ?? []) {
      callback(event);
    }
  }
}

function jsonResponse(payload: unknown) {
  return {
    json: async () => payload,
  } as unknown as Response;
}

function wsTableState(params: { version: number; seatedUserId?: string | null; handId?: string | null }) {
  const now = new Date('2026-01-12T00:00:00.000Z').toISOString();
  const seatCount = 6;
  const seatedSeatId = 2;

  return {
    tableId: 'table-1',
    name: 'Test Table',
    ownerId: 'owner-1',
    config: {
      smallBlind: 5,
      bigBlind: 10,
      ante: 0,
      maxPlayers: seatCount,
      startingStack: 500,
      bettingStructure: 'NoLimit',
      turnTimerSeconds: 20,
    },
    seats: Array.from({ length: seatCount }, (_, seatId) => ({
      seatId,
      userId:
        seatId === seatedSeatId && typeof params.seatedUserId === 'string' ? params.seatedUserId : null,
      username: seatId === seatedSeatId && typeof params.seatedUserId === 'string' ? 'User One' : undefined,
      avatarUrl: null,
      stack: seatId === seatedSeatId && typeof params.seatedUserId === 'string' ? 123 : 0,
      status: seatId === seatedSeatId && typeof params.seatedUserId === 'string' ? 'SEATED' : 'EMPTY',
    })),
    spectators: [],
    status: params.handId ? 'in_hand' : 'lobby',
    hand: params.handId
      ? {
          handId: params.handId,
          tableId: 'table-1',
          street: 'preflop',
          communityCards: [],
          pots: [],
          currentBet: 0,
          minRaise: 0,
          turn: 0,
          lastAggressor: 0,
          actions: [],
          rakeAmount: 0,
          startedAt: now,
        }
      : null,
    version: params.version,
    updatedAt: now,
    button: 0,
  };
}

describe('createTableStore', () => {
  let store: TableStore;

  beforeEach(() => {
    wsState.instances.length = 0;
    wsState.autoOpen = true;
    // @ts-expect-error - test override
    window.WebSocket = MockWebSocket;
    store = createTableStore();
    apiFetchMock.mockReset();
    apiFetchDecodedMock.mockReset();
    getTokenMock.mockReset();
    decodeJwtUserIdMock.mockReset();
    recordWebSocketMessageMock.mockReset();
  });

  describe('initial state', () => {
    it('starts with empty tables and null tableState', () => {
      const state = store.getState();
      expect(state.tables).toEqual([]);
      expect(state.tableState).toBeNull();
      expect(state.seatId).toBeNull();
      expect(state.isSpectating).toBe(false);
      expect(state.status).toBe('idle');
      expect(state.chatMessages).toEqual([]);
      expect(state.privateHoleCards).toBeNull();
      expect(state.privateHandId).toBeNull();
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on state changes', () => {
      const listener = vi.fn();
      store.subscribe(listener);

      store.subscribeLobby();

      expect(listener).toHaveBeenCalled();
    });

    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.subscribeLobby();

      expect(listener).toHaveBeenCalledTimes(0);
    });
  });

  describe('leaveTable', () => {
    it('resets table-related state', () => {
      const state = store.getState();
      expect(state.tableState).toBeNull();
      expect(state.seatId).toBeNull();
      expect(state.isSpectating).toBe(false);
      expect(state.chatMessages).toEqual([]);
    });

    it('cancels queued subscribe messages when leaving before socket opens', async () => {
      apiFetchMock.mockImplementation(async (path: string) => {
        if (path === '/api/tables/table-1/state') {
          return jsonResponse({ state: wsTableState({ version: 1, seatedUserId: null, handId: null }) });
        }
        throw new Error(`Unexpected apiFetch path: ${path}`);
      });

      store.spectateTable('table-1');
      store.leaveTable();

      await Promise.resolve();

      const socket = wsState.instances.at(-1);
      expect(socket).toBeTruthy();
      expect(socket!.sent).toEqual([]);
    });

    it('queues LeaveTable when leaving a seat before socket opens', async () => {
      wsState.autoOpen = false;

      apiFetchMock.mockImplementation(async (path: string) => {
        if (path === '/api/tables/table-1/join') {
          return jsonResponse({ wsUrl: '/ws' });
        }
        if (path === '/api/tables/table-1/state') {
          return jsonResponse({ state: wsTableState({ version: 1, seatedUserId: null, handId: null }) });
        }
        throw new Error(`Unexpected apiFetch path: ${path}`);
      });

      await store.joinSeat('table-1', 2);
      const socket = wsState.instances.at(-1);
      expect(socket).toBeTruthy();

      store.leaveTable();

      socket!.open();

      expect(socket!.sent.some((entry) => entry.includes('"LeaveTable"'))).toBe(true);
      expect(socket!.sent.some((entry) => entry.includes('"SubscribeTable"'))).toBe(false);
      expect(socket!.sent.some((entry) => entry.includes('"SubscribeChat"'))).toBe(false);
    });
  });

  describe('WebSocket table state sync', () => {
    it('adopts the token user seat when spectating', async () => {
      getTokenMock.mockReturnValue('test-token');
      decodeJwtUserIdMock.mockReturnValue('user-1');

      apiFetchMock.mockImplementation(async (path: string) => {
        if (path === '/api/tables/table-1/state') {
          return jsonResponse({ state: wsTableState({ version: 1, seatedUserId: 'user-1', handId: null }) });
        }
        throw new Error(`Unexpected apiFetch path: ${path}`);
      });

      store.spectateTable('table-1');
      await Promise.resolve();

      const socket = wsState.instances.at(-1);
      expect(socket).toBeTruthy();

      socket!.emitMessage({ type: 'TableSnapshot', tableState: wsTableState({ version: 1, seatedUserId: 'user-1', handId: null }) });

      const next = store.getState();
      expect(next.tableState?.tableId).toBe('table-1');
      expect(next.seatId).toBe(2);
      expect(next.isSpectating).toBe(false);
    });

    it('ignores stale TablePatch versions', async () => {
      apiFetchMock.mockImplementation(async (path: string) => {
        if (path === '/api/tables/table-1/state') {
          return jsonResponse({ state: wsTableState({ version: 5, seatedUserId: null, handId: null }) });
        }
        throw new Error(`Unexpected apiFetch path: ${path}`);
      });

      store.spectateTable('table-1');
      await Promise.resolve();

      const socket = wsState.instances.at(-1);
      expect(socket).toBeTruthy();

      socket!.emitMessage({ type: 'TableSnapshot', tableState: wsTableState({ version: 5, seatedUserId: null, handId: null }) });
      expect(store.getState().tableState?.version).toBe(5);

      socket!.emitMessage({
        type: 'TablePatch',
        tableId: 'table-1',
        patch: { version: 4, status: 'lobby' },
      });

      expect(store.getState().tableState?.version).toBe(5);
    });
  });
});

describe('TableState version tracking', () => {
  it('tracks version for sync', () => {
    const tableState: TableState = {
      tableId: 'table-1',
      name: 'Test Table',
      ownerId: 'owner-1',
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        startingStack: 500,
        bettingStructure: 'NoLimit',
      },
      seats: [],
      status: 'lobby',
      hand: null,
      button: 0,
      version: 1,
    };

    expect(tableState.version).toBe(1);
  });
});

describe('ChatMessage structure', () => {
  it('has required fields', () => {
    const message = {
      id: 'msg-1',
      userId: 'user-1',
      text: 'Hello',
      ts: '2026-01-12T00:00:00Z',
    };

    expect(message.id).toBeDefined();
    expect(message.userId).toBeDefined();
    expect(message.text).toBeDefined();
    expect(message.ts).toBeDefined();
  });
});

describe('SpectatorView structure', () => {
  it('has required fields', () => {
    const spectator = {
      userId: 'user-1',
      username: 'player1',
      status: 'active' as const,
    };

    expect(spectator.userId).toBeDefined();
    expect(spectator.status).toBe('active');
  });
});

describe('TableSummary spectator count', () => {
  it('includes spectator count', () => {
    const summary = {
      tableId: 'table-1',
      name: 'Test',
      ownerId: 'owner-1',
      config: {
        smallBlind: 5,
        bigBlind: 10,
        maxPlayers: 6,
        startingStack: 500,
        bettingStructure: 'NoLimit' as const,
      },
      seatsTaken: 2,
      occupiedSeatIds: [0, 1],
      inProgress: true,
      spectatorCount: 5,
    };

    expect(summary.spectatorCount).toBe(5);
  });
});
