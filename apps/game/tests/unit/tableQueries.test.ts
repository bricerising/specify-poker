import { describe, expect, it, vi } from 'vitest';

import { createTableQueries } from '../../src/services/table/tableQueries';
import type { Table, TableConfig, TableState } from '../../src/domain/types';

function makeConfig(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    smallBlind: 1,
    bigBlind: 2,
    ante: 0,
    maxPlayers: 3,
    startingStack: 200,
    turnTimerSeconds: 20,
    ...overrides,
  };
}

function makeTable(overrides: Partial<Table> = {}): Table {
  return {
    tableId: 'table-1',
    name: 'Main Table',
    ownerId: 'owner-1',
    config: makeConfig(),
    status: 'WAITING',
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeState(overrides: Partial<TableState> = {}): TableState {
  return {
    tableId: 'table-1',
    seats: [
      { seatId: 0, userId: null, stack: 0, status: 'EMPTY', holeCards: null },
      { seatId: 1, userId: null, stack: 0, status: 'EMPTY', holeCards: null },
      { seatId: 2, userId: null, stack: 0, status: 'EMPTY', holeCards: null },
    ],
    spectators: [],
    hand: null,
    button: 0,
    version: 0,
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

describe('tableQueries', () => {
  it('lists table summaries with derived metrics', async () => {
    const table1 = makeTable({ tableId: 'table-1', name: 'One' });
    const state1 = makeState({
      tableId: 'table-1',
      seats: [
        { seatId: 0, userId: 'user-1', stack: 100, status: 'SEATED', holeCards: null },
        { seatId: 1, userId: null, stack: 0, status: 'EMPTY', holeCards: null },
        { seatId: 2, userId: 'user-2', stack: 0, status: 'RESERVED', holeCards: null },
      ],
      spectators: [{ userId: 'spectator-1', status: 'ACTIVE', joinedAt: 'now' }],
    });

    const table2 = makeTable({ tableId: 'table-2', name: 'Two' });
    const state2 = makeState({
      tableId: 'table-2',
      seats: [
        { seatId: 0, userId: null, stack: 0, status: 'EMPTY', holeCards: null },
        { seatId: 1, userId: 'user-3', stack: 50, status: 'ACTIVE', holeCards: null },
        { seatId: 2, userId: null, stack: 0, status: 'EMPTY', holeCards: null },
      ],
      spectators: [
        { userId: 'spectator-2', status: 'ACTIVE', joinedAt: 'now' },
        { userId: 'spectator-3', status: 'DISCONNECTED', joinedAt: 'now' },
      ],
      hand: {} as unknown as TableState['hand'],
    });

    const tableStore = {
      list: vi.fn(async () => ['table-1', 'table-2']),
      get: vi.fn(async (tableId: string) => (tableId === 'table-1' ? table1 : table2)),
    };
    const tableStateStore = {
      get: vi.fn(async (tableId: string) => (tableId === 'table-1' ? state1 : state2)),
    };

    const queries = createTableQueries({ tableStore, tableStateStore });
    const snapshot = await queries.listTableSummariesSnapshot();

    expect(snapshot.summaries).toEqual([
      {
        tableId: 'table-1',
        name: 'One',
        ownerId: 'owner-1',
        config: table1.config,
        seatsTaken: 2,
        occupiedSeatIds: [0, 2],
        inProgress: false,
        spectatorCount: 1,
      },
      {
        tableId: 'table-2',
        name: 'Two',
        ownerId: 'owner-1',
        config: table2.config,
        seatsTaken: 1,
        occupiedSeatIds: [1],
        inProgress: true,
        spectatorCount: 2,
      },
    ]);

    expect(snapshot.activeTableCount).toBe(1);
    expect(snapshot.seatedPlayerCount).toBe(3);
    expect(snapshot.spectatorTotal).toBe(3);
  });

  it('loads table and state or returns null when missing', async () => {
    const tableStore = {
      list: vi.fn(async () => []),
      get: vi.fn(async (_tableId: string) => null),
    };
    const tableStateStore = {
      get: vi.fn(async (_tableId: string) => null),
    };

    const queries = createTableQueries({ tableStore, tableStateStore });
    await expect(queries.loadTableAndState('table-1')).resolves.toBeNull();
  });
});
