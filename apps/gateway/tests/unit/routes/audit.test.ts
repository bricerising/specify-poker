import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import auditRouter from '../../../src/http/routes/audit';
import { dispatchToRouter } from '../helpers/express';

// Mock the gRPC client
vi.mock('../../../src/grpc/clients', () => {
  const gameClient = {};
  const notifyClient = {};
  const eventClient = {
    QueryEvents: vi.fn(),
    GetEvent: vi.fn(),
    GetHandRecord: vi.fn(),
    GetHandReplay: vi.fn(),
    GetHandHistory: vi.fn(),
    GetHandsForUser: vi.fn(),
  };
  const playerClient = {};

  return {
    gameClient,
    notifyClient,
    eventClient,
    playerClient,
    getGameClient: () => gameClient,
    getNotifyClient: () => notifyClient,
    getEventClient: () => eventClient,
    getPlayerClient: () => playerClient,
  };
});

// Mock logger
vi.mock('../../../src/observability/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { eventClient } from '../../../src/grpc/clients';

describe('Audit Routes', () => {
  const auth = { userId: 'user-123', claims: {} };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/audit/events', () => {
    it('should return queried events', async () => {
      const mockEvents = [
        { event_id: 'e1', type: 'HAND_STARTED' },
        { event_id: 'e2', type: 'ACTION_TAKEN' },
      ];

      vi.mocked(eventClient.QueryEvents).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, {
            events: mockEvents,
            total: 2,
            has_more: false,
          });
        },
      );

      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/events',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          events: mockEvents,
          total: 2,
          hasMore: false,
        }),
      );
    });

    it('should pass query parameters', async () => {
      vi.mocked(eventClient.QueryEvents).mockImplementation(
        (req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { events: [], total: 0, has_more: false });
        },
      );

      await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/events',
        auth,
        query: { tableId: 't1', limit: '10' },
      });

      expect(eventClient.QueryEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          table_id: 't1',
          limit: 10,
        }),
        expect.any(Function),
      );
    });

    it('returns 400 when limit is invalid', async () => {
      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/events',
        auth,
        query: { limit: 'nope' },
      });

      expect(response.statusCode).toBe(400);
      expect(eventClient.QueryEvents).not.toHaveBeenCalled();
    });

    it('returns 400 when startTime is invalid', async () => {
      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/events',
        auth,
        query: { startTime: 'not-a-date' },
      });

      expect(response.statusCode).toBe(400);
      expect(eventClient.QueryEvents).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/audit/events/:eventId', () => {
    it('should return single event', async () => {
      const mockEvent = { event_id: 'e1', type: 'HAND_STARTED' };

      vi.mocked(eventClient.GetEvent).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockEvent);
        },
      );

      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/events/e1',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(mockEvent);
    });

    it('should return 404 for non-existent event', async () => {
      vi.mocked(eventClient.GetEvent).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(new Error('Not found'), null);
        },
      );

      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/events/not-found',
        auth,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/audit/hands/:handId', () => {
    it('should return hand record', async () => {
      const mockHand = {
        hand_id: 'h1',
        table_id: 't1',
        participants: [],
      };

      vi.mocked(eventClient.GetHandRecord).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockHand);
        },
      );

      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/hands/h1',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(mockHand);
    });
  });

  describe('GET /api/audit/hands/:handId/replay', () => {
    it('should return hand replay', async () => {
      const mockReplay = {
        hand_id: 'h1',
        events: [
          { event_id: 'e1', type: 'HAND_STARTED' },
          { event_id: 'e2', type: 'ACTION_TAKEN' },
        ],
      };

      vi.mocked(eventClient.GetHandReplay).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, mockReplay);
        },
      );

      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/hands/h1/replay',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          handId: 'h1',
          events: expect.any(Array),
        }),
      );
    });
  });

  describe('GET /api/audit/tables/:tableId/hands', () => {
    it('should return hand history for table', async () => {
      const mockHands = [
        { hand_id: 'h1', table_id: 't1' },
        { hand_id: 'h2', table_id: 't1' },
      ];

      vi.mocked(eventClient.GetHandHistory).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { hands: mockHands, total: 2 });
        },
      );

      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/tables/t1/hands',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ hands: mockHands, total: 2 }));
    });
  });

  describe('GET /api/audit/my-hands', () => {
    it('should return current user hand history', async () => {
      const mockHands = [{ hand_id: 'h1', table_id: 't1' }];

      vi.mocked(eventClient.GetHandsForUser).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { hands: mockHands, total: 1 });
        },
      );

      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/my-hands',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ hands: mockHands }));
    });
  });

  describe('GET /api/audit/users/:userId/hands', () => {
    it('should return own hand history', async () => {
      const mockHands = [{ hand_id: 'h1', table_id: 't1' }];

      vi.mocked(eventClient.GetHandsForUser).mockImplementation(
        (_req: unknown, callback: (err: Error | null, response: unknown) => void) => {
          callback(null, { hands: mockHands, total: 1 });
        },
      );

      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/users/user-123/hands',
        auth,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(expect.objectContaining({ hands: mockHands }));
    });

    it('should return 403 when accessing other user hands', async () => {
      const response = await dispatchToRouter(auditRouter, {
        method: 'GET',
        url: '/users/other-user/hands',
        auth,
      });

      expect(response.statusCode).toBe(403);
      expect(response.body).toEqual(expect.objectContaining({ error: 'Forbidden' }));
    });
  });
});
