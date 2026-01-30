import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
  data: new Map<string, string>(),
  sets: new Map<string, Set<string>>(),
  published: [] as Array<{ channel: string; message: string }>,
}));

const grpcState = vi.hoisted(() => ({
  reserveResponse: { ok: true, reservation_id: 'reservation-1' },
  commitResponse: { ok: true },
  cashOutResponse: { ok: true },
  contributionResponse: { ok: true },
  settleResponse: { ok: true },
  reserveError: null as Error | null,
  commitError: null as Error | null,
  cashOutError: null as Error | null,
  contributionError: null as Error | null,
  settleError: null as Error | null,
  reserveCalls: [] as unknown[],
  commitCalls: [] as unknown[],
  releaseCalls: [] as unknown[],
  cashOutCalls: [] as unknown[],
  contributionCalls: [] as unknown[],
  settleCalls: [] as unknown[],
  publishedEvents: [] as Array<{ type: string; payload: unknown }>,
}));

vi.mock('../../src/storage/redisClient', () => {
  const ensureSet = (key: string) => {
    if (!redisState.sets.has(key)) {
      redisState.sets.set(key, new Set());
    }
    return redisState.sets.get(key)!;
  };

  const client = {
    isOpen: true,
    on: vi.fn(),
    connect: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
    set: vi.fn(async (key: string, value: string, options?: { NX?: boolean; PX?: number }) => {
      if (options?.NX && redisState.data.has(key)) {
        return null;
      }
      redisState.data.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => redisState.data.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      const deleted = redisState.data.delete(key);
      redisState.sets.delete(key);
      return deleted ? 1 : 0;
    }),
    sAdd: vi.fn(async (key: string, value: string) => {
      const set = ensureSet(key);
      const sizeBefore = set.size;
      set.add(value);
      return set.size - sizeBefore;
    }),
    sRem: vi.fn(async (key: string, value: string) => {
      const set = ensureSet(key);
      const hadValue = set.delete(value);
      return hadValue ? 1 : 0;
    }),
    sMembers: vi.fn(async (key: string) => Array.from(ensureSet(key))),
    sIsMember: vi.fn(async (key: string, value: string) => ensureSet(key).has(value)),
    publish: vi.fn(async (channel: string, message: string) => {
      redisState.published.push({ channel, message });
      return 1;
    }),
  };

  return {
    __esModule: true,
    default: client,
    connectRedis: async () => undefined,
    closeRedisClient: async () => undefined,
    __resetRedis: () => {
      redisState.data.clear();
      redisState.sets.clear();
      redisState.published.length = 0;
    },
  };
});

vi.mock('../../src/observability/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/api/grpc/clients', () => ({
  getBalanceClient: () => ({
    ReserveForBuyIn: (
      request: unknown,
      callback: (err: Error | null, response?: unknown) => void,
    ) => {
      grpcState.reserveCalls.push(request);
      if (grpcState.reserveError) {
        callback(grpcState.reserveError);
        return;
      }
      callback(null, grpcState.reserveResponse);
    },
    CommitReservation: (
      request: unknown,
      callback: (err: Error | null, response?: unknown) => void,
    ) => {
      grpcState.commitCalls.push(request);
      if (grpcState.commitError) {
        callback(grpcState.commitError);
        return;
      }
      callback(null, grpcState.commitResponse);
    },
    ReleaseReservation: (
      request: unknown,
      callback: (err: Error | null, response?: unknown) => void,
    ) => {
      grpcState.releaseCalls.push(request);
      callback(null, { ok: true });
    },
    ProcessCashOut: (
      request: unknown,
      callback: (err: Error | null, response?: unknown) => void,
    ) => {
      grpcState.cashOutCalls.push(request);
      if (grpcState.cashOutError) {
        callback(grpcState.cashOutError);
        return;
      }
      callback(null, grpcState.cashOutResponse);
    },
    RecordContribution: (
      request: unknown,
      callback: (err: Error | null, response?: unknown) => void,
    ) => {
      grpcState.contributionCalls.push(request);
      if (grpcState.contributionError) {
        callback(grpcState.contributionError);
        return;
      }
      callback(null, grpcState.contributionResponse);
    },
    SettlePot: (request: unknown, callback: (err: Error | null, response?: unknown) => void) => {
      grpcState.settleCalls.push(request);
      if (grpcState.settleError) {
        callback(grpcState.settleError);
        return;
      }
      callback(null, grpcState.settleResponse);
    },
  }),
  getEventClient: () => ({
    PublishEvent: (
      request: { type: string; payload: unknown },
      callback: (err: Error | null, response?: unknown) => void,
    ) => {
      grpcState.publishedEvents.push({ type: request.type, payload: request.payload });
      callback(null, { success: true });
    },
  }),
}));

import { createHandlers } from '../../src/api/grpc/handlers';
import type { TableConfig } from '../../src/domain/types';
import { tableService } from '../../src/services/tableService';
import { tableStateStore } from '../../src/storage/tableStateStore';
import * as redisClientModule from '../../src/storage/redisClient';

const resetGrpcState = () => {
  grpcState.reserveResponse = { ok: true, reservation_id: 'reservation-1' };
  grpcState.commitResponse = { ok: true };
  grpcState.cashOutResponse = { ok: true };
  grpcState.contributionResponse = { ok: true };
  grpcState.settleResponse = { ok: true };
  grpcState.reserveError = null;
  grpcState.commitError = null;
  grpcState.cashOutError = null;
  grpcState.contributionError = null;
  grpcState.settleError = null;
  grpcState.reserveCalls.length = 0;
  grpcState.commitCalls.length = 0;
  grpcState.releaseCalls.length = 0;
  grpcState.cashOutCalls.length = 0;
  grpcState.contributionCalls.length = 0;
  grpcState.settleCalls.length = 0;
  grpcState.publishedEvents.length = 0;
};

const resetRedisState = () => {
  const moduleWithReset = redisClientModule as typeof redisClientModule & {
    __resetRedis?: () => void;
  };
  moduleWithReset.__resetRedis?.();
};

const defaultConfig: TableConfig = {
  smallBlind: 1,
  bigBlind: 2,
  ante: 0,
  maxPlayers: 6,
  startingStack: 200,
  turnTimerSeconds: 20,
};

const callUnary = async <Req, Res>(
  handler: (call: { request: Req }, callback: (err: Error | null, response?: Res) => void) => void,
  request: Req,
) =>
  new Promise<{ err: Error | null; response?: Res }>((resolve) => {
    handler({ request } as { request: Req }, (err, response) => resolve({ err, response }));
  });

beforeEach(() => {
  resetGrpcState();
  resetRedisState();
  vi.clearAllMocks();
});

afterEach(() => {
  tableService.shutdown();
});

describe('TableService consumer flows', () => {
  it('reserves, commits, and seats a player on buy-in', async () => {
    const table = await tableService.createTable('High Rollers', 'owner-1', defaultConfig);

    const result = await tableService.joinSeat(table.tableId, 'user-1', 0, 150);

    expect(result.ok).toBe(true);
    expect(grpcState.reserveCalls).toHaveLength(1);
    expect(grpcState.commitCalls).toHaveLength(1);
    expect(grpcState.publishedEvents.some((event) => event.type === 'PLAYER_JOINED')).toBe(true);

    const state = await tableStateStore.get(table.tableId);
    expect(state?.seats[0].status).toBe('SEATED');
    expect(state?.seats[0].stack).toBe(150);
    expect(state?.seats[0].reservationId).toBe('reservation-1');
  });

  it('treats repeated joinSeat as idempotent when already seated', async () => {
    const table = await tableService.createTable('Idempotent Join', 'owner-1', defaultConfig);

    const first = await tableService.joinSeat(table.tableId, 'user-1', 0, 150);
    expect(first.ok).toBe(true);
    expect(grpcState.reserveCalls).toHaveLength(1);
    expect(grpcState.commitCalls).toHaveLength(1);

    const second = await tableService.joinSeat(table.tableId, 'user-1', 0, 150);
    expect(second.ok).toBe(true);
    expect(grpcState.reserveCalls).toHaveLength(1);
    expect(grpcState.commitCalls).toHaveLength(1);

    const state = await tableStateStore.get(table.tableId);
    expect(state?.seats[0].status).toBe('SEATED');
    expect(state?.seats[0].stack).toBe(150);
  });

  it('resumes a reserved seat by reusing the buy-in idempotency key', async () => {
    const table = await tableService.createTable('Reserved Seat', 'owner-1', defaultConfig);

    const state = await tableStateStore.get(table.tableId);
    expect(state).toBeTruthy();

    state!.seats[0].userId = 'user-1';
    state!.seats[0].status = 'RESERVED';
    state!.seats[0].pendingBuyInAmount = 150;
    state!.seats[0].buyInIdempotencyKey = 'buyin-key-1';
    state!.version += 1;
    state!.updatedAt = new Date().toISOString();
    await tableStateStore.save(state!);

    const result = await tableService.joinSeat(table.tableId, 'user-1', 0, 150);

    expect(result.ok).toBe(true);
    expect(grpcState.reserveCalls).toHaveLength(1);
    expect(grpcState.commitCalls).toHaveLength(1);

    const reserveCall = grpcState.reserveCalls[0] as { idempotency_key?: string };
    expect(reserveCall.idempotency_key).toBe('buyin-key-1');

    const finalState = await tableStateStore.get(table.tableId);
    expect(finalState?.seats[0].status).toBe('SEATED');
    expect(finalState?.seats[0].stack).toBe(150);
    expect(finalState?.seats[0].pendingBuyInAmount).toBeUndefined();
    expect(finalState?.seats[0].buyInIdempotencyKey).toBeUndefined();
  });

  it('releases the reservation when the commit fails', async () => {
    grpcState.commitResponse = { ok: false, error: 'COMMIT_FAILED' };

    const table = await tableService.createTable('High Rollers', 'owner-1', defaultConfig);
    const result = await tableService.joinSeat(table.tableId, 'user-1', 1, 200);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMIT_FAILED');
    expect(grpcState.releaseCalls).toHaveLength(1);

    const state = await tableStateStore.get(table.tableId);
    expect(state?.seats[1].status).toBe('EMPTY');
    expect(state?.seats[1].userId).toBeNull();
  });

  it('seats players when balance service is unavailable and emits an event', async () => {
    const loggerModule = await import('../../src/observability/logger');
    const logger = loggerModule.default as unknown as { error: ReturnType<typeof vi.fn> };
    grpcState.reserveError = new Error('balance down');

    const table = await tableService.createTable('Main Table', 'owner-1', defaultConfig);
    const result = await tableService.joinSeat(table.tableId, 'user-1', 0, 120);

    expect(result.ok).toBe(true);
    expect(logger.error).toHaveBeenCalled();
    expect(grpcState.publishedEvents.some((event) => event.type === 'BALANCE_UNAVAILABLE')).toBe(
      true,
    );

    const state = await tableStateStore.get(table.tableId);
    expect(state?.seats[0].status).toBe('SEATED');
    expect(state?.seats[0].stack).toBe(120);
    expect(state?.seats[0].reservationId).toBeUndefined();
  });

  it('attempts cash-out and emits failure telemetry when Balance declines', async () => {
    grpcState.cashOutResponse = { ok: false, error: 'CASHOUT_FAILED' };

    const table = await tableService.createTable('Daily Table', 'owner-1', defaultConfig);
    await tableService.joinSeat(table.tableId, 'user-1', 0, 100);

    const result = await tableService.leaveSeat(table.tableId, 'user-1');

    expect(result.ok).toBe(true);
    expect(grpcState.cashOutCalls).toHaveLength(1);
    expect(grpcState.publishedEvents.some((event) => event.type === 'CASHOUT_FAILED')).toBe(true);

    const state = await tableStateStore.get(table.tableId);
    expect(state?.seats[0].status).toBe('EMPTY');
    expect(state?.seats[0].userId).toBeNull();
  });

  it('rejects seat conflicts and lets seated players spectate no-op', async () => {
    const table = await tableService.createTable('Seat Conflicts', 'owner-1', defaultConfig);
    await tableService.joinSeat(table.tableId, 'user-1', 0, 100);

    const conflict = await tableService.joinSeat(table.tableId, 'user-2', 0, 100);
    expect(conflict.ok).toBe(false);
    expect(conflict.error).toBe('SEAT_NOT_AVAILABLE');

    const spectatorJoin = await tableService.joinSpectator(table.tableId, 'user-1');
    expect(spectatorJoin.ok).toBe(true);
  });

  it('adds and removes spectators while preserving table state', async () => {
    const table = await tableService.createTable('Spectators', 'owner-1', defaultConfig);

    const joinResult = await tableService.joinSpectator(table.tableId, 'spectator-1');
    expect(joinResult.ok).toBe(true);

    const stateAfterJoin = await tableStateStore.get(table.tableId);
    expect(stateAfterJoin?.spectators).toHaveLength(1);

    const leaveResult = await tableService.leaveSpectator(table.tableId, 'spectator-1');
    expect(leaveResult.ok).toBe(true);

    const stateAfterLeave = await tableStateStore.get(table.tableId);
    expect(stateAfterLeave?.spectators).toHaveLength(0);
  });

  it('completes a hand when a player folds', async () => {
    vi.useFakeTimers();
    const table = await tableService.createTable('Fast Fold', 'owner-1', defaultConfig);
    await tableService.joinSeat(table.tableId, 'player-1', 0, 200);
    await tableService.joinSeat(table.tableId, 'player-2', 1, 200);

    const state = await tableStateStore.get(table.tableId);
    expect(state?.hand).toBeDefined();
    expect(grpcState.contributionCalls).toHaveLength(2);

    const activeTurn = state?.hand?.turn ?? 0;
    const seat = state?.seats[activeTurn];
    expect(seat?.userId).toBeTruthy();

    const result = await tableService.submitAction(table.tableId, seat!.userId!, { type: 'FOLD' });
    expect(result.ok).toBe(true);
    expect(grpcState.settleCalls).toHaveLength(1);

    const updatedState = await tableStateStore.get(table.tableId);
    expect(updatedState?.hand).toBeNull();

    vi.useRealTimers();
  });
});

describe('gRPC handler consumer flows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('creates the default main table when listing tables', async () => {
    const handlers = createHandlers();

    const { err, response } = await callUnary(handlers.ListTables, {});

    expect(err).toBeNull();
    expect(response?.tables).toHaveLength(1);
    expect(response?.tables[0].name).toBe('Main Table');
  });

  it('returns hole cards only to the owning player', async () => {
    const table = await tableService.createTable('Spectator Test', 'owner-1', defaultConfig);
    await tableService.joinSeat(table.tableId, 'player-1', 0, 200);
    await tableService.joinSeat(table.tableId, 'player-2', 1, 200);

    const handlers = createHandlers();

    const playerView = await callUnary(handlers.GetTableState, {
      table_id: table.tableId,
      user_id: 'player-1',
    });
    expect(playerView.err).toBeNull();
    expect(playerView.response?.hole_cards.length).toBe(2);

    const spectatorView = await callUnary(handlers.GetTableState, {
      table_id: table.tableId,
      user_id: 'spectator-1',
    });
    expect(spectatorView.err).toBeNull();
    expect(spectatorView.response?.hole_cards.length).toBe(0);
  });

  it('rejects actions from spectators', async () => {
    const table = await tableService.createTable('Spectator Table', 'owner-1', defaultConfig);
    await tableService.joinSeat(table.tableId, 'player-1', 0, 200);
    await tableService.joinSeat(table.tableId, 'player-2', 1, 200);

    const handlers = createHandlers();

    const response = await callUnary(handlers.SubmitAction, {
      table_id: table.tableId,
      user_id: 'spectator-1',
      action_type: 'fold',
    });

    expect(response.err).toBeNull();
    expect(response.response?.ok).toBe(false);
    expect(response.response?.error).toBe('PLAYER_NOT_AT_TABLE');
  });

  it('returns gRPC errors when tables are missing', async () => {
    const handlers = createHandlers();

    const getResult = await callUnary(handlers.GetTable, { table_id: 'missing' });
    expect(getResult.err?.message).toBe('TABLE_NOT_FOUND');

    const deleteResult = await callUnary(handlers.DeleteTable, { table_id: 'missing' });
    expect(deleteResult.err?.message).toBe('TABLE_NOT_FOUND');
  });

  it('allows spectators to join and leave via handlers', async () => {
    const table = await tableService.createTable('Handlers', 'owner-1', defaultConfig);
    const handlers = createHandlers();

    const joinResult = await callUnary(handlers.JoinSpectator, {
      table_id: table.tableId,
      user_id: 'spectator-1',
    });
    expect(joinResult.err).toBeNull();
    expect(joinResult.response?.ok).toBe(true);

    const leaveResult = await callUnary(handlers.LeaveSpectator, {
      table_id: table.tableId,
      user_id: 'spectator-1',
    });
    expect(leaveResult.err).toBeNull();
    expect(leaveResult.response?.ok).toBe(true);
  });

  it('enforces moderation permissions and mute state', async () => {
    const table = await tableService.createTable('Moderation', 'owner-1', defaultConfig);
    await tableService.joinSeat(table.tableId, 'player-1', 0, 200);

    const handlers = createHandlers();

    const kickDenied = await callUnary(handlers.KickPlayer, {
      table_id: table.tableId,
      owner_id: 'not-owner',
      target_user_id: 'player-1',
    });
    expect(kickDenied.err?.message).toBe('NOT_AUTHORIZED');

    const muteResult = await callUnary(handlers.MutePlayer, {
      table_id: table.tableId,
      owner_id: 'owner-1',
      target_user_id: 'player-1',
    });
    expect(muteResult.err).toBeNull();

    const isMuted = await callUnary(handlers.IsMuted, {
      table_id: table.tableId,
      user_id: 'player-1',
    });
    expect(isMuted.err).toBeNull();
    expect(isMuted.response?.is_muted).toBe(true);

    const unmuteResult = await callUnary(handlers.UnmutePlayer, {
      table_id: table.tableId,
      owner_id: 'owner-1',
      target_user_id: 'player-1',
    });
    expect(unmuteResult.err).toBeNull();
  });
});
