import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import tablesRouter from '../../../src/http/routes/tables';
import { dispatchToRouter } from '../helpers/express';

// Mock the gRPC client
vi.mock('../../../src/grpc/clients', () => ({
  gameClient: {
    ListTables: vi.fn(),
    CreateTable: vi.fn(),
    GetTable: vi.fn(),
    DeleteTable: vi.fn(),
    GetTableState: vi.fn(),
    JoinSeat: vi.fn(),
    LeaveSeat: vi.fn(),
    JoinSpectator: vi.fn(),
    LeaveSpectator: vi.fn(),
    SubmitAction: vi.fn(),
    KickPlayer: vi.fn(),
    MutePlayer: vi.fn(),
    UnmutePlayer: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../src/observability/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { gameClient } from '../../../src/grpc/clients';

describe('Tables Routes', () => {
  const auth = { userId: 'user-123', claims: {} };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/tables', () => {
    it('should return list of tables', async () => {
      const mockTables = [
        { table_id: 't1', name: 'Table 1' },
        { table_id: 't2', name: 'Table 2' },
      ];

      vi.mocked(gameClient.ListTables).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { tables: mockTables });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'GET',
        url: '/',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(mockTables);
    });

    it('should handle errors', async () => {
      vi.mocked(gameClient.ListTables).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(new Error('Connection failed'), null);
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'GET',
        url: '/',
        auth,
      });

      expect(response.statusCode).toBe(500);
      expect(response.body).toEqual(expect.objectContaining({ error: 'Failed to list tables' }));
    });
  });

  describe('POST /api/tables', () => {
    it('should create a table', async () => {
      const mockTable = { table_id: 't1', name: 'New Table' };

      vi.mocked(gameClient.CreateTable).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockTable);
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/',
        auth,
        body: { name: 'New Table', config: { smallBlind: 1, bigBlind: 2 } },
      });

      expect(response.statusCode).toBe(201);
      expect(response.body).toEqual(mockTable);
    });

    it('defaults bigBlind to 2 * smallBlind when omitted', async () => {
      const mockTable = { table_id: 't1', name: 'New Table' };

      vi.mocked(gameClient.CreateTable).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockTable);
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/',
        auth,
        body: { name: 'New Table', config: { smallBlind: 5 } },
      });

      expect(response.statusCode).toBe(201);
      expect(gameClient.CreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ small_blind: 5, big_blind: 10 }),
        }),
        expect.any(Function),
      );
    });

    it('rejects an invalid table config', async () => {
      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/',
        auth,
        body: { name: 'New Table', config: { smallBlind: 5, bigBlind: 6 } },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: 'Invalid request' }));
    });
  });

  describe('GET /api/tables/:tableId', () => {
    it('should return table details', async () => {
      const mockTable = { table_id: 't1', name: 'Table 1' };

      vi.mocked(gameClient.GetTable).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockTable);
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'GET',
        url: '/t1',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(mockTable);
    });

    it('should return 404 for non-existent table', async () => {
      vi.mocked(gameClient.GetTable).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(new Error('Not found'), null);
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'GET',
        url: '/not-found',
        auth,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/tables/:tableId/state', () => {
    it('should return table state', async () => {
      const mockState = { table_id: 't1', status: 'lobby' };
      vi.mocked(gameClient.GetTableState).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { state: mockState });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'GET',
        url: '/t1/state',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({ state: mockState });
    });
  });

  describe('POST /api/tables/:tableId/join', () => {
    it('should reject invalid seatId', async () => {
      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/join',
        auth,
        body: { seatId: 'not-a-number' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: 'seatId is required' }));
    });
  });

  describe('POST /api/tables/:tableId/seats/:seatId/join', () => {
    it('should join a seat successfully', async () => {
      vi.mocked(gameClient.JoinSeat).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: true });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/seats/0/join',
        auth,
        headers: { host: 'localhost:4000' },
        body: { buyInAmount: 200 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ tableId: 't1', seatId: 0 }));
      expect((response.body as { wsUrl?: string }).wsUrl).toBeDefined();
    });

    it('should return error when seat not available', async () => {
      vi.mocked(gameClient.JoinSeat).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: false, error: 'SEAT_NOT_AVAILABLE' });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/seats/0/join',
        auth,
        body: { buyInAmount: 200 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: 'SEAT_NOT_AVAILABLE' }));
    });
  });

  describe('POST /api/tables/:tableId/leave', () => {
    it('should leave a table', async () => {
      vi.mocked(gameClient.LeaveSeat).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: true });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/leave',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ ok: true }));
    });
  });

  describe('POST /api/tables/:tableId/action', () => {
    it('should submit an action successfully', async () => {
      vi.mocked(gameClient.SubmitAction).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: true });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/action',
        auth,
        body: { actionType: 'FOLD' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ ok: true }));
    });

    it('should return error for invalid action', async () => {
      vi.mocked(gameClient.SubmitAction).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: false, error: 'NOT_YOUR_TURN' });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/action',
        auth,
        body: { actionType: 'FOLD' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: 'NOT_YOUR_TURN' }));
    });
  });

  describe('POST /api/tables/:tableId/spectate', () => {
    it('should join as spectator', async () => {
      vi.mocked(gameClient.JoinSpectator).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: true });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/spectate',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ ok: true }));
    });
  });

  describe('POST /api/tables/:tableId/spectate/leave', () => {
    it('should leave spectating', async () => {
      vi.mocked(gameClient.LeaveSpectator).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { ok: true });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/spectate/leave',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ ok: true }));
    });
  });

  describe('Moderation routes', () => {
    it('kicks a player', async () => {
      vi.mocked(gameClient.KickPlayer).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {});
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/kick',
        auth,
        body: { targetUserId: 'user-2' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ ok: true }));
    });

    it('mutes and unmutes a player', async () => {
      vi.mocked(gameClient.MutePlayer).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {});
        },
      );
      vi.mocked(gameClient.UnmutePlayer).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {});
        },
      );

      const muteResponse = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/mute',
        auth,
        body: { targetUserId: 'user-2' },
      });
      const unmuteResponse = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/unmute',
        auth,
        body: { targetUserId: 'user-2' },
      });

      expect(muteResponse.statusCode).toBe(200);
      expect(unmuteResponse.statusCode).toBe(200);
    });
  });

  describe('Moderation by seatId routes', () => {
    it('rejects an invalid seatId', async () => {
      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/moderation/kick',
        auth,
        body: { seatId: 'not-a-number' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual(expect.objectContaining({ error: 'seatId is required' }));
    });

    it('returns 404 when the seat is not occupied', async () => {
      vi.mocked(gameClient.GetTableState).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { state: { seats: [{ seat_id: 0, user_id: null }] } });
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/moderation/mute',
        auth,
        body: { seatId: 0 },
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).toEqual(expect.objectContaining({ error: 'Seat not occupied' }));
    });

    it('kicks a player by seatId and returns the updated table state', async () => {
      vi.mocked(gameClient.GetTableState)
        .mockImplementationOnce(
          (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
            callback(null, { state: { seats: [{ seat_id: 0, user_id: 'user-2' }] } });
          },
        )
        .mockImplementationOnce(
          (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
            callback(null, { state: { seats: [{ seat_id: 0, user_id: null }], version: 2 } });
          },
        );

      vi.mocked(gameClient.KickPlayer).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {});
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/moderation/kick',
        auth,
        body: { seatId: 0 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          tableId: 't1',
          seatId: 0,
          userId: 'user-2',
          action: 'kick',
          tableState: expect.objectContaining({ version: 2 }),
        }),
      );
    });

    it('mutes a player by seatId', async () => {
      vi.mocked(gameClient.GetTableState).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { state: { seats: [{ seat_id: 1, user_id: 'user-2' }] } });
        },
      );

      vi.mocked(gameClient.MutePlayer).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {});
        },
      );

      const response = await dispatchToRouter(tablesRouter, {
        method: 'POST',
        url: '/t1/moderation/mute',
        auth,
        body: { seatId: 1 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          tableId: 't1',
          seatId: 1,
          userId: 'user-2',
          action: 'mute',
        }),
      );
    });
  });
});
