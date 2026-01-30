import type { Request, Response } from 'express';
import { Router } from 'express';
import { grpc } from '../../grpc/unaryClients';
import { safeAuthedRoute } from '../utils/safeAuthedRoute';
import { safeRoute } from '../utils/safeRoute';

const router = Router();

function parseOptionalNonNegativeInt(
  value: unknown,
  fallback: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: fallback };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: 'Invalid number' };
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: 'Invalid number' };
  }
  return { ok: true, value: parsed };
}

function parseOptionalTimestampSeconds(
  value: unknown,
): { ok: true; value: { seconds: number } | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: 'Invalid timestamp' };
  }

  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) {
    return { ok: false, error: 'Invalid timestamp' };
  }

  return { ok: true, value: { seconds: Math.floor(ms / 1000) } };
}

// GET /api/audit/events - Query events
router.get(
  '/events',
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId, handId, userId, types, startTime, endTime, limit, offset, cursor } =
        req.query;

      const limitParsed = parseOptionalNonNegativeInt(limit, 50);
      if (!limitParsed.ok) {
        res.status(400).json({ error: 'Invalid limit' });
        return;
      }

      const offsetParsed = parseOptionalNonNegativeInt(offset, 0);
      if (!offsetParsed.ok) {
        res.status(400).json({ error: 'Invalid offset' });
        return;
      }

      const startTimeParsed = parseOptionalTimestampSeconds(startTime);
      if (!startTimeParsed.ok) {
        res.status(400).json({ error: 'Invalid startTime' });
        return;
      }

      const endTimeParsed = parseOptionalTimestampSeconds(endTime);
      if (!endTimeParsed.ok) {
        res.status(400).json({ error: 'Invalid endTime' });
        return;
      }

      const response = await grpc.event.QueryEvents({
        table_id: tableId as string | undefined,
        hand_id: handId as string | undefined,
        user_id: userId as string | undefined,
        types: types ? (types as string).split(',') : undefined,
        start_time: startTimeParsed.value,
        end_time: endTimeParsed.value,
        limit: limitParsed.value,
        offset: offsetParsed.value,
        cursor: cursor as string | undefined,
      });

      res.json({
        events: response.events || [],
        total: response.total,
        hasMore: response.has_more,
        nextCursor: response.next_cursor,
      });
    },
    { logMessage: 'Failed to query events' },
  ),
);

// GET /api/audit/events/:eventId - Get single event
router.get(
  '/events/:eventId',
  safeRoute(
    async (req: Request, res: Response) => {
      const { eventId } = req.params;
      const response = await grpc.event.GetEvent({ event_id: eventId });
      res.json(response);
    },
    {
      logMessage: 'Failed to get event',
      status: 404,
      errorMessage: 'Event not found',
      getLogContext: (req) => ({ eventId: req.params.eventId }),
    },
  ),
);

// GET /api/audit/hands/:handId - Get hand record
router.get(
  '/hands/:handId',
  safeRoute(
    async (req: Request, res: Response) => {
      const { handId } = req.params;
      const requesterId = req.auth?.userId;
      const response = await grpc.event.GetHandRecord({
        hand_id: handId,
        requester_id: requesterId,
      });
      res.json(response);
    },
    {
      logMessage: 'Failed to get hand record',
      status: 404,
      errorMessage: 'Hand not found',
      getLogContext: (req) => ({ handId: req.params.handId }),
    },
  ),
);

// GET /api/audit/hands/:handId/replay - Get hand replay
router.get(
  '/hands/:handId/replay',
  safeRoute(
    async (req: Request, res: Response) => {
      const { handId } = req.params;
      const response = await grpc.event.GetHandReplay({ hand_id: handId });
      res.json({
        handId: response.hand_id,
        events: response.events || [],
      });
    },
    {
      logMessage: 'Failed to get hand replay',
      status: 404,
      errorMessage: 'Hand not found',
      getLogContext: (req) => ({ handId: req.params.handId }),
    },
  ),
);

// GET /api/audit/tables/:tableId/hands - Get hand history for a table
router.get(
  '/tables/:tableId/hands',
  safeRoute(
    async (req: Request, res: Response) => {
      const { tableId } = req.params;
      const { limit, offset } = req.query;
      const requesterId = req.auth?.userId;

      const limitParsed = parseOptionalNonNegativeInt(limit, 20);
      if (!limitParsed.ok) {
        res.status(400).json({ error: 'Invalid limit' });
        return;
      }

      const offsetParsed = parseOptionalNonNegativeInt(offset, 0);
      if (!offsetParsed.ok) {
        res.status(400).json({ error: 'Invalid offset' });
        return;
      }

      const response = await grpc.event.GetHandHistory({
        table_id: tableId,
        limit: limitParsed.value,
        offset: offsetParsed.value,
        requester_id: requesterId,
      });

      res.json({
        hands: response.hands || [],
        total: response.total,
      });
    },
    {
      logMessage: 'Failed to get hand history',
      getLogContext: (req) => ({ tableId: req.params.tableId }),
    },
  ),
);

// GET /api/audit/users/:userId/hands - Get hands for a user
router.get(
  '/users/:userId/hands',
  safeRoute(
    async (req: Request, res: Response) => {
      const { userId } = req.params;
      const { limit, offset } = req.query;

      // Only allow users to see their own hand history (unless admin)
      const requesterId = req.auth?.userId;
      const isAdmin = Boolean((req.auth?.claims as Record<string, unknown> | undefined)?.admin);
      if (requesterId !== userId && !isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const limitParsed = parseOptionalNonNegativeInt(limit, 20);
      if (!limitParsed.ok) {
        res.status(400).json({ error: 'Invalid limit' });
        return;
      }

      const offsetParsed = parseOptionalNonNegativeInt(offset, 0);
      if (!offsetParsed.ok) {
        res.status(400).json({ error: 'Invalid offset' });
        return;
      }

      const response = await grpc.event.GetHandsForUser({
        user_id: userId,
        limit: limitParsed.value,
        offset: offsetParsed.value,
      });

      res.json({
        hands: response.hands || [],
        total: response.total,
      });
    },
    {
      logMessage: 'Failed to get user hands',
      getLogContext: (req) => ({ userId: req.params.userId }),
    },
  ),
);

// GET /api/audit/my-hands - Get current user's hand history
router.get(
  '/my-hands',
  safeAuthedRoute(
    async (req: Request, res: Response, userId: string) => {
      const { limit, offset } = req.query;

      const limitParsed = parseOptionalNonNegativeInt(limit, 20);
      if (!limitParsed.ok) {
        res.status(400).json({ error: 'Invalid limit' });
        return;
      }

      const offsetParsed = parseOptionalNonNegativeInt(offset, 0);
      if (!offsetParsed.ok) {
        res.status(400).json({ error: 'Invalid offset' });
        return;
      }

      const response = await grpc.event.GetHandsForUser({
        user_id: userId,
        limit: limitParsed.value,
        offset: offsetParsed.value,
      });

      res.json({
        hands: response.hands || [],
        total: response.total,
      });
    },
    {
      logMessage: 'Failed to get my hands',
      errorMessage: 'Failed to get hand history',
    },
  ),
);

export default router;
