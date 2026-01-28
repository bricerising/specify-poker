import { describe, expect, it } from 'vitest';

import { inferSeatIdForUserId } from '../../src/state/seatResolver';
import type { HandState, TableSeat, TableState } from '../../src/state/tableTypes';

function makeSeat(
  seatId: number,
  userId: string | null,
  overrides: Partial<TableSeat> = {},
): TableSeat {
  return {
    seatId,
    userId,
    stack: 0,
    status: 'SEATED',
    ...overrides,
  };
}

function makeHand(currentTurnSeat: number): HandState {
  return {
    handId: 'hand-1',
    currentStreet: 'PREFLOP',
    currentTurnSeat,
    currentBet: 0,
    minRaise: 2,
    raiseCapped: false,
    roundContributions: {},
    actedSeats: [],
    communityCards: [],
    pots: [],
    actionTimerDeadline: null,
    bigBlind: 2,
  };
}

function makeTableState(seats: TableSeat[], hand: TableState['hand']): TableState {
  return {
    tableId: 'table-1',
    name: 'Test Table',
    ownerId: 'owner-1',
    config: {
      smallBlind: 1,
      bigBlind: 2,
      maxPlayers: 6,
      startingStack: 200,
      bettingStructure: 'NoLimit',
    },
    seats,
    status: 'lobby',
    hand,
    button: 0,
    version: 0,
  };
}

describe('inferSeatIdForUserId', () => {
  it('returns null when userId is null', () => {
    const state = makeTableState([makeSeat(0, null)], null);
    expect(inferSeatIdForUserId(state, null)).toBeNull();
  });

  it('returns null when the user is not seated', () => {
    const state = makeTableState([makeSeat(0, null), makeSeat(1, null)], null);
    expect(inferSeatIdForUserId(state, 'user-1')).toBeNull();
  });

  it('returns the only matching seatId', () => {
    const state = makeTableState([makeSeat(0, 'user-1'), makeSeat(1, null)], null);
    expect(inferSeatIdForUserId(state, 'user-1')).toBe(0);
  });

  it('prefers the current turn seat when duplicates exist', () => {
    const state = makeTableState(
      [makeSeat(0, 'user-1'), makeSeat(1, null), makeSeat(2, 'user-1')],
      makeHand(2),
    );
    expect(inferSeatIdForUserId(state, 'user-1')).toBe(2);
  });

  it('prefers an active/all-in/folded seat when no turn match exists', () => {
    const state = makeTableState(
      [
        makeSeat(0, 'user-1', { status: 'SEATED' }),
        makeSeat(1, null),
        makeSeat(2, 'user-1', { status: 'ACTIVE' }),
      ],
      makeHand(1),
    );
    expect(inferSeatIdForUserId(state, 'user-1')).toBe(2);
  });

  it('falls back to the first matching seat when no strategy matches', () => {
    const state = makeTableState(
      [
        makeSeat(0, 'user-1', { status: 'SEATED' }),
        makeSeat(1, null),
        makeSeat(2, 'user-1', { status: 'SEATED' }),
      ],
      makeHand(1),
    );
    expect(inferSeatIdForUserId(state, 'user-1')).toBe(0);
  });
});
