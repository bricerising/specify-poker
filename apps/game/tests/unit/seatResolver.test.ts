import { describe, expect, it } from 'vitest';

import { resolveSeatForUser } from '../../src/services/table/seatResolver';
import type { HandState, Seat, TableState } from '../../src/domain/types';

function makeSeat(seatId: number, userId: string | null, overrides: Partial<Seat> = {}): Seat {
  return {
    seatId,
    userId,
    stack: 0,
    status: 'SEATED',
    holeCards: null,
    ...overrides,
  };
}

function makeHand(turn: number): HandState {
  return {
    handId: 'hand-1',
    tableId: 'table-1',
    street: 'PREFLOP',
    communityCards: [],
    pots: [],
    currentBet: 0,
    minRaise: 2,
    bigBlind: 2,
    turn,
    lastAggressor: 0,
    actions: [],
    rakeAmount: 0,
    startedAt: '2026-01-12T00:00:00.000Z',
    deck: [],
    roundContributions: {},
    totalContributions: {},
    actedSeats: [],
    raiseCapped: false,
  };
}

function makeState(seats: Seat[], hand: TableState['hand']): TableState {
  return {
    tableId: 'table-1',
    seats,
    spectators: [],
    hand,
    button: 0,
    version: 0,
    updatedAt: '2026-01-12T00:00:00.000Z',
  };
}

describe('resolveSeatForUser', () => {
  it('returns undefined when the user is not seated', () => {
    const state = makeState([makeSeat(0, null), makeSeat(1, null)], null);
    expect(resolveSeatForUser(state, 'user-1')).toBeUndefined();
  });

  it('returns the only matching seat', () => {
    const state = makeState([makeSeat(0, 'user-1'), makeSeat(1, null)], null);
    expect(resolveSeatForUser(state, 'user-1')?.seatId).toBe(0);
  });

  it('prefers the current turn seat when duplicates exist', () => {
    const state = makeState(
      [makeSeat(0, 'user-1'), makeSeat(1, null), makeSeat(2, 'user-1')],
      makeHand(2),
    );
    expect(resolveSeatForUser(state, 'user-1')?.seatId).toBe(2);
  });

  it('prefers a seat with hole cards when no turn seat matches', () => {
    const state = makeState(
      [
        makeSeat(0, 'user-1'),
        makeSeat(1, null),
        makeSeat(2, 'user-1', {
          holeCards: [
            { rank: 'A', suit: 'spades' },
            { rank: 'K', suit: 'spades' },
          ],
        }),
      ],
      makeHand(1),
    );
    expect(resolveSeatForUser(state, 'user-1')?.seatId).toBe(2);
  });

  it('prefers an active/all-in/folded seat when no turn/hole-card match exists', () => {
    const state = makeState(
      [
        makeSeat(0, 'user-1', { status: 'SEATED' }),
        makeSeat(1, null),
        makeSeat(2, 'user-1', { status: 'ACTIVE' }),
      ],
      makeHand(1),
    );
    expect(resolveSeatForUser(state, 'user-1')?.seatId).toBe(2);
  });

  it('falls back to the first matching seat when no strategy matches', () => {
    const state = makeState(
      [
        makeSeat(0, 'user-1', { status: 'SEATED' }),
        makeSeat(1, null),
        makeSeat(2, 'user-1', { status: 'SEATED' }),
      ],
      makeHand(1),
    );
    expect(resolveSeatForUser(state, 'user-1')?.seatId).toBe(0);
  });
});
