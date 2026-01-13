import { Router, Request, Response } from "express";
import { eventClient } from "../../grpc/clients";
import logger from "../../observability/logger";

const router = Router();

function requireUserId(req: Request, res: Response) {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

// Helper to convert gRPC callback to promise
function grpcCall<TRequest, TResponse>(
  method: (request: TRequest, callback: (err: Error | null, response: TResponse) => void) => void,
  request: TRequest
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    method(request, (err: Error | null, response: TResponse) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// GET /api/audit/events - Query events
router.get("/events", async (req: Request, res: Response) => {
  try {
    const { tableId, handId, userId, types, startTime, endTime, limit, offset, cursor } =
      req.query;

    const response = await grpcCall<{
      events: unknown[];
      total: number;
      has_more: boolean;
      next_cursor?: string;
    }>(eventClient.QueryEvents.bind(eventClient), {
      table_id: tableId as string | undefined,
      hand_id: handId as string | undefined,
      user_id: userId as string | undefined,
      types: types ? (types as string).split(",") : undefined,
      start_time: startTime ? { seconds: Math.floor(new Date(startTime as string).getTime() / 1000) } : undefined,
      end_time: endTime ? { seconds: Math.floor(new Date(endTime as string).getTime() / 1000) } : undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
      cursor: cursor as string | undefined,
    });

    res.json({
      events: response.events || [],
      total: response.total,
      hasMore: response.has_more,
      nextCursor: response.next_cursor,
    });
  } catch (err) {
    logger.error({ err }, "Failed to query events");
    res.status(500).json({ error: "Failed to query events" });
  }
});

// GET /api/audit/events/:eventId - Get single event
router.get("/events/:eventId", async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const response = await grpcCall(eventClient.GetEvent.bind(eventClient), { event_id: eventId });
    res.json(response);
  } catch (err) {
    logger.error({ err, eventId: req.params.eventId }, "Failed to get event");
    res.status(404).json({ error: "Event not found" });
  }
});

// GET /api/audit/hands/:handId - Get hand record
router.get("/hands/:handId", async (req: Request, res: Response) => {
  try {
    const { handId } = req.params;
    const requesterId = req.auth?.userId;
    const response = await grpcCall(eventClient.GetHandRecord.bind(eventClient), {
      hand_id: handId,
      requester_id: requesterId,
    });
    res.json(response);
  } catch (err) {
    logger.error({ err, handId: req.params.handId }, "Failed to get hand record");
    res.status(404).json({ error: "Hand not found" });
  }
});

// GET /api/audit/hands/:handId/replay - Get hand replay
router.get("/hands/:handId/replay", async (req: Request, res: Response) => {
  try {
    const { handId } = req.params;
    const response = await grpcCall(eventClient.GetHandReplay.bind(eventClient), { hand_id: handId });
    res.json({
      handId: response.hand_id,
      events: response.events || [],
    });
  } catch (err) {
    logger.error({ err, handId: req.params.handId }, "Failed to get hand replay");
    res.status(404).json({ error: "Hand not found" });
  }
});

// GET /api/audit/tables/:tableId/hands - Get hand history for a table
router.get("/tables/:tableId/hands", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { limit, offset } = req.query;
    const requesterId = req.auth?.userId;

    const response = await grpcCall(eventClient.GetHandHistory.bind(eventClient), {
      table_id: tableId,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
      requester_id: requesterId,
    });

    res.json({
      hands: response.hands || [],
      total: response.total,
    });
  } catch (err) {
    logger.error({ err, tableId: req.params.tableId }, "Failed to get hand history");
    res.status(500).json({ error: "Failed to get hand history" });
  }
});

// GET /api/audit/users/:userId/hands - Get hands for a user
router.get("/users/:userId/hands", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit, offset } = req.query;

    // Only allow users to see their own hand history (unless admin)
    const requesterId = req.auth?.userId;
    if (requesterId !== userId && !req.auth?.claims?.admin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const response = await grpcCall(eventClient.GetHandsForUser.bind(eventClient), {
      user_id: userId,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    return res.json({
      hands: response.hands || [],
      total: response.total,
    });
  } catch (err) {
    logger.error({ err, userId: req.params.userId }, "Failed to get user hands");
    return res.status(500).json({ error: "Failed to get user hands" });
  }
});

// GET /api/audit/my-hands - Get current user's hand history
router.get("/my-hands", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { limit, offset } = req.query;

    const response = await grpcCall(eventClient.GetHandsForUser.bind(eventClient), {
      user_id: userId,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    return res.json({
      hands: response.hands || [],
      total: response.total,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get my hands");
    return res.status(500).json({ error: "Failed to get hand history" });
  }
});

export default router;
