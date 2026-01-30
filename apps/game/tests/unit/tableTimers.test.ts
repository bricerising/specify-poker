import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTableTimers } from '../../src/services/table/tableTimers';
import type { Table, TableState } from '../../src/domain/types';

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    tableId: 'table-1',
    name: 'Main Table',
    ownerId: 'owner-1',
    config: {
      smallBlind: 1,
      bigBlind: 2,
      ante: 0,
      maxPlayers: 2,
      startingStack: 200,
      turnTimerSeconds: 1,
    },
    status: 'PLAYING',
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeState(overrides: Partial<TableState> = {}): TableState {
  return {
    tableId: 'table-1',
    seats: [
      { seatId: 0, userId: 'user-1', stack: 100, status: 'ACTIVE', holeCards: null },
      { seatId: 1, userId: 'user-2', stack: 100, status: 'ACTIVE', holeCards: null },
    ],
    spectators: [],
    hand: {
      handId: 'hand-1',
      tableId: 'table-1',
      street: 'PREFLOP',
      communityCards: [],
      pots: [],
      currentBet: 0,
      minRaise: 2,
      bigBlind: 2,
      turn: 0,
      lastAggressor: 0,
      actions: [],
      rakeAmount: 0,
      startedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      deck: [],
      roundContributions: {},
      totalContributions: {},
      actedSeats: [],
      raiseCapped: false,
    },
    button: 0,
    version: 0,
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

describe('tableTimers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('records turn time and auto-checks on timeout when checking is legal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const table = makeTable();
    const state = makeState();

    let pendingTask: Promise<unknown> | undefined;
    const recordTurnTimeout = vi.fn();
    const submitActionUnlocked = vi.fn(async () => ({ ok: true }));

    const timers = createTableTimers({
      runTableTask: async (_tableId, task) => {
        pendingTask = task();
        return (await pendingTask) as unknown;
      },
      loadTableState: async (_tableId) => state,
      repairTurnIfNeeded: async (_table, current) => current,
      submitActionUnlocked,
      recordTurnTimeout,
      startNextHandIfPossible: async () => undefined,
      logError: vi.fn(),
    });

    await timers.startTurnTimer(table, state);

    vi.advanceTimersByTime(500);
    expect(timers.getTurnTimeMetric('table-1', 'hand-1', 0)?.street).toBe('PREFLOP');
    expect(timers.getTurnTimeMetric('table-1', 'hand-1', 0)?.durationMs).toBe(500);

    vi.advanceTimersByTime(500);
    await pendingTask;

    expect(recordTurnTimeout).toHaveBeenCalledWith('PREFLOP', 'CHECK');
    expect(submitActionUnlocked).toHaveBeenCalledWith('table-1', 'user-1', { type: 'CHECK' });
    expect(timers.consumeHandTimedOut('table-1', 'hand-1')).toBe(true);

    timers.shutdown();
  });

  it('schedules next-hand callback via the table task runner', async () => {
    vi.useFakeTimers();

    let pendingTask: Promise<unknown> | undefined;
    const startNextHandIfPossible = vi.fn(async () => undefined);

    const timers = createTableTimers({
      runTableTask: async (_tableId, task) => {
        pendingTask = task();
        return (await pendingTask) as unknown;
      },
      loadTableState: async () => null,
      repairTurnIfNeeded: async (_table, state) => state,
      submitActionUnlocked: async () => ({ ok: true }),
      recordTurnTimeout: vi.fn(),
      startNextHandIfPossible,
      logError: vi.fn(),
    });

    timers.scheduleNextHandStart('table-1', 1000);
    expect(startNextHandIfPossible).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    await pendingTask;

    expect(startNextHandIfPossible).toHaveBeenCalledWith('table-1');

    timers.shutdown();
  });
});

