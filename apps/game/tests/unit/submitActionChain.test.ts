import { describe, expect, it, vi } from 'vitest';

import { createSubmitActionChain } from '../../src/services/table/submitActionChain';
import type { SubmitActionAcceptedResult } from '../../src/services/table/submitActionChain';
import type { Action, Seat, Table, TableState } from '../../src/domain/types';

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
      turnTimerSeconds: 20,
    },
    status: 'PLAYING',
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  return {
    seatId: 0,
    userId: 'user-1',
    stack: 100,
    status: 'ACTIVE',
    holeCards: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<TableState> = {}): TableState {
  return {
    tableId: 'table-1',
    seats: [makeSeat()],
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

function makeAction(overrides: Partial<Action> = {}): Action {
  return {
    actionId: 'action-1',
    handId: 'hand-1',
    seatId: 0,
    userId: 'user-1',
    type: 'CHECK',
    amount: 0,
    timestamp: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

describe('submitActionChain', () => {
  it('adds a deterministic idempotency key for ACTION_TAKEN events', async () => {
    const table = makeTable();
    const state = makeState();
    const action = makeAction({ actionId: 'action-123' });
    const accepted: SubmitActionAcceptedResult = {
      accepted: true,
      state,
      action,
      handComplete: false,
    } as SubmitActionAcceptedResult;

    const deps = {
      recordTurnTime: vi.fn(),
      recordAction: vi.fn(),
      saveState: vi.fn(async () => undefined),
      publishTableState: vi.fn(async () => undefined),
      recordActionContribution: vi.fn(async () => ({ type: 'ok' as const })),
      warn: vi.fn(),
      emitGameEvent: vi.fn(async () => undefined),
      clearTurnTimer: vi.fn(),
      clearTurnStartMeta: vi.fn(),
      handleHandEnded: vi.fn(async () => undefined),
      startTurnTimer: vi.fn(async () => undefined),
    };

    const chain = createSubmitActionChain(deps);
    await chain({
      tableId: table.tableId,
      userId: 'user-1',
      actionInput: { type: 'CHECK' },
      actionStreet: 'PREFLOP',
      table,
      actingSeat: makeSeat(),
      previousTotalContribution: 0,
      turnTimeMetric: null,
      result: accepted,
    });

    expect(deps.emitGameEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'event:ACTION_TAKEN:action-123',
      }),
    );
  });
});

