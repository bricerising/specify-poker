import { describe, expect, it } from 'vitest';

import {
  buyInAmountSchema,
  moderationRequestSchema,
  seatIdSchema,
  tableConfigSchema,
  tableConfigInputSchema,
  tableCreateRequestInputSchema,
  tableJoinSeatRequestSchema,
  tableJoinResponseSchema,
  tableSummarySchema,
  userProfileSchema,
} from '../src/schemas/index';

describe('shared schemas', () => {
  it('validates table config and summary', () => {
    const config = {
      smallBlind: 10,
      bigBlind: 20,
      ante: null,
      maxPlayers: 6,
      startingStack: 2000,
      bettingStructure: 'NoLimit' as const,
    };

    const summary = {
      tableId: 'table-1',
      name: 'Friendly Table',
      ownerId: 'user-1',
      config,
      seatsTaken: 0,
      occupiedSeatIds: [],
      inProgress: false,
    };

    expect(tableConfigSchema.parse(config)).toEqual(config);
    expect(tableSummarySchema.parse(summary)).toEqual({ ...summary, spectatorCount: 0 });
  });

  it('validates user profile and moderation request', () => {
    const profile = {
      userId: 'user-1',
      nickname: 'Dealer',
      avatarUrl: null,
      stats: {
        handsPlayed: 0,
        wins: 0,
      },
      friends: [],
    };

    expect(userProfileSchema.parse(profile)).toEqual(profile);
    expect(moderationRequestSchema.parse({ seatId: 2 })).toEqual({
      seatId: 2,
    });
  });

  it('validates table join response', () => {
    const payload = {
      tableId: 'table-1',
      seatId: 2,
      wsUrl: 'ws://localhost:4000/ws',
    };

    expect(tableJoinResponseSchema.parse(payload)).toEqual(payload);
  });

  it('coerces common gateway request inputs', () => {
    expect(seatIdSchema.parse('3')).toBe(3);
    expect(buyInAmountSchema.parse('200')).toBe(200);

    expect(tableJoinSeatRequestSchema.parse({ seatId: '1', buyInAmount: '50' })).toEqual({
      seatId: 1,
      buyInAmount: 50,
    });

    expect(tableConfigInputSchema.parse({ smallBlind: 5 })).toEqual({
      smallBlind: 5,
      bigBlind: 10,
      ante: 0,
      maxPlayers: 9,
      startingStack: 200,
      bettingStructure: 'NoLimit',
      turnTimerSeconds: 20,
    });

    expect(tableCreateRequestInputSchema.parse({ name: 'Test Table' })).toEqual({
      name: 'Test Table',
      config: {
        smallBlind: 1,
        bigBlind: 2,
        ante: 0,
        maxPlayers: 9,
        startingStack: 200,
        bettingStructure: 'NoLimit',
        turnTimerSeconds: 20,
      },
    });
  });
});
