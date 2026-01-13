import { Router, Request, Response } from "express";
import { gameClient } from "../../grpc/clients";
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

function buildWsUrl(req: Request) {
  const host = req.get("host");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" ? forwardedProto : req.protocol;
  const wsProtocol = protocol === "https" ? "wss" : "ws";
  return `${wsProtocol}://${host}/ws`;
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

function parseSeatId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 8) {
    return null;
  }
  return parsed;
}

function seatUserId(seat: unknown): string | null {
  if (!seat || typeof seat !== "object") {
    return null;
  }
  const record = seat as Record<string, unknown>;
  const userId = record.user_id ?? record.userId;
  return typeof userId === "string" && userId.trim().length > 0 ? userId : null;
}

// GET /api/tables - List all tables
router.get("/", async (_req: Request, res: Response) => {
  try {
    const response = await grpcCall(gameClient.ListTables.bind(gameClient), {});
    res.json(response.tables || []);
  } catch (err) {
    logger.error({ err }, "Failed to list tables");
    res.status(500).json({ error: "Failed to list tables" });
  }
});

// POST /api/tables - Create a new table
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, config } = req.body;
    const ownerId = requireUserId(req, res);
    if (!ownerId) return;

    const response = await grpcCall(gameClient.CreateTable.bind(gameClient), {
      name,
      owner_id: ownerId,
      config: {
        small_blind: config?.smallBlind || 1,
        big_blind: config?.bigBlind || 2,
        ante: config?.ante || 0,
        max_players: config?.maxPlayers || 9,
        starting_stack: config?.startingStack || 200,
        turn_timer_seconds: config?.turnTimerSeconds || 20,
      },
    });
    return res.status(201).json(response);
  } catch (err) {
    logger.error({ err }, "Failed to create table");
    return res.status(500).json({ error: "Failed to create table" });
  }
});

// GET /api/tables/:tableId - Get table details
router.get("/:tableId", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const response = await grpcCall(gameClient.GetTable.bind(gameClient), { table_id: tableId });
    res.json(response);
  } catch (err) {
    logger.error({ err, tableId: req.params.tableId }, "Failed to get table");
    res.status(404).json({ error: "Table not found" });
  }
});

// DELETE /api/tables/:tableId - Delete a table
router.delete("/:tableId", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    await grpcCall(gameClient.DeleteTable.bind(gameClient), { table_id: tableId });
    res.status(204).send();
  } catch (err) {
    logger.error({ err, tableId: req.params.tableId }, "Failed to delete table");
    res.status(500).json({ error: "Failed to delete table" });
  }
});

// GET /api/tables/:tableId/state - Get table state
router.get("/:tableId/state", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const userId = req.auth?.userId ?? "";
    const response = await grpcCall(gameClient.GetTableState.bind(gameClient), {
      table_id: tableId,
      user_id: userId,
    });
    res.json(response);
  } catch (err) {
    logger.error({ err, tableId: req.params.tableId }, "Failed to get table state");
    res.status(500).json({ error: "Failed to get table state" });
  }
});

// POST /api/tables/:tableId/join - Join a seat (body includes seatId)
router.post("/:tableId/join", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { seatId, buyInAmount } = req.body;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const parsedSeatId = typeof seatId === "number" ? seatId : parseInt(seatId, 10);
    if (!Number.isInteger(parsedSeatId)) {
      return res.status(400).json({ error: "seatId is required" });
    }

    const response = await grpcCall(gameClient.JoinSeat.bind(gameClient), {
      table_id: tableId,
      user_id: userId,
      seat_id: parsedSeatId,
      buy_in_amount: buyInAmount,
    });

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to join seat" });
    }
    return res.json({ tableId, seatId: parsedSeatId, wsUrl: buildWsUrl(req) });
  } catch (err) {
    logger.error({ err }, "Failed to join seat");
    return res.status(500).json({ error: "Failed to join seat" });
  }
});

// POST /api/tables/:tableId/seats/:seatId/join - Join a seat
router.post("/:tableId/seats/:seatId/join", async (req: Request, res: Response) => {
  try {
    const { tableId, seatId } = req.params;
    const { buyInAmount } = req.body;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = await grpcCall(gameClient.JoinSeat.bind(gameClient), {
      table_id: tableId,
      user_id: userId,
      seat_id: parseInt(seatId, 10),
      buy_in_amount: buyInAmount,
    });

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to join seat" });
    }
    return res.json({ tableId, seatId: parseInt(seatId, 10), wsUrl: buildWsUrl(req) });
  } catch (err) {
    logger.error({ err }, "Failed to join seat");
    return res.status(500).json({ error: "Failed to join seat" });
  }
});

// POST /api/tables/:tableId/leave - Leave the table
router.post("/:tableId/leave", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = await grpcCall(gameClient.LeaveSeat.bind(gameClient), {
      table_id: tableId,
      user_id: userId,
    });

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to leave seat" });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to leave seat");
    return res.status(500).json({ error: "Failed to leave seat" });
  }
});

// POST /api/tables/:tableId/spectate - Join as spectator
router.post("/:tableId/spectate", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = await grpcCall(gameClient.JoinSpectator.bind(gameClient), {
      table_id: tableId,
      user_id: userId,
    });

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to join as spectator" });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to join as spectator");
    return res.status(500).json({ error: "Failed to join as spectator" });
  }
});

// POST /api/tables/:tableId/spectate/leave - Leave spectating
router.post("/:tableId/spectate/leave", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = await grpcCall(gameClient.LeaveSpectator.bind(gameClient), {
      table_id: tableId,
      user_id: userId,
    });

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to leave spectating" });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to leave spectating");
    return res.status(500).json({ error: "Failed to leave spectating" });
  }
});

// POST /api/tables/:tableId/action - Submit a game action
router.post("/:tableId/action", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { actionType, amount } = req.body;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const response = await grpcCall(gameClient.SubmitAction.bind(gameClient), {
      table_id: tableId,
      user_id: userId,
      action_type: actionType,
      amount: amount,
    });

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Invalid action" });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to submit action");
    return res.status(500).json({ error: "Failed to submit action" });
  }
});

// POST /api/tables/:tableId/moderation/kick - Kick by seatId (owner only)
router.post("/:tableId/moderation/kick", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const ownerId = requireUserId(req, res);
    if (!ownerId) return;

    const seatId = parseSeatId(req.body?.seatId);
    if (seatId === null) {
      return res.status(400).json({ error: "seatId is required" });
    }

    const stateResponse = await grpcCall(gameClient.GetTableState.bind(gameClient), {
      table_id: tableId,
      user_id: ownerId,
    });
    const seats = (stateResponse.state?.seats ?? []) as unknown[];
    const targetSeat = seats.find((seat) => {
      if (!seat || typeof seat !== "object") return false;
      const record = seat as Record<string, unknown>;
      const id = record.seat_id ?? record.seatId;
      return Number(id) === seatId;
    });

    const targetUserId = seatUserId(targetSeat);
    if (!targetUserId) {
      return res.status(404).json({ error: "Seat not occupied" });
    }

    await grpcCall(gameClient.KickPlayer.bind(gameClient), {
      table_id: tableId,
      owner_id: ownerId,
      target_user_id: targetUserId,
    });

    const updated = await grpcCall(gameClient.GetTableState.bind(gameClient), {
      table_id: tableId,
      user_id: ownerId,
    });

    return res.json({
      tableId,
      seatId,
      userId: targetUserId,
      action: "kick",
      tableState: updated.state,
    });
  } catch (err) {
    logger.error({ err }, "Failed to kick player");
    return res.status(500).json({ error: "Failed to kick player" });
  }
});

// POST /api/tables/:tableId/moderation/mute - Mute by seatId (owner only)
router.post("/:tableId/moderation/mute", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const ownerId = requireUserId(req, res);
    if (!ownerId) return;

    const seatId = parseSeatId(req.body?.seatId);
    if (seatId === null) {
      return res.status(400).json({ error: "seatId is required" });
    }

    const stateResponse = await grpcCall(gameClient.GetTableState.bind(gameClient), {
      table_id: tableId,
      user_id: ownerId,
    });
    const seats = (stateResponse.state?.seats ?? []) as unknown[];
    const targetSeat = seats.find((seat) => {
      if (!seat || typeof seat !== "object") return false;
      const record = seat as Record<string, unknown>;
      const id = record.seat_id ?? record.seatId;
      return Number(id) === seatId;
    });

    const targetUserId = seatUserId(targetSeat);
    if (!targetUserId) {
      return res.status(404).json({ error: "Seat not occupied" });
    }

    await grpcCall(gameClient.MutePlayer.bind(gameClient), {
      table_id: tableId,
      owner_id: ownerId,
      target_user_id: targetUserId,
    });

    return res.json({
      tableId,
      seatId,
      userId: targetUserId,
      action: "mute",
    });
  } catch (err) {
    logger.error({ err }, "Failed to mute player");
    return res.status(500).json({ error: "Failed to mute player" });
  }
});

// POST /api/tables/:tableId/kick - Kick a player (owner only)
router.post("/:tableId/kick", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { targetUserId } = req.body;
    const ownerId = requireUserId(req, res);
    if (!ownerId) return;

    await grpcCall(gameClient.KickPlayer.bind(gameClient), {
      table_id: tableId,
      owner_id: ownerId,
      target_user_id: targetUserId,
    });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to kick player");
    return res.status(500).json({ error: "Failed to kick player" });
  }
});

// POST /api/tables/:tableId/mute - Mute a player (owner only)
router.post("/:tableId/mute", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { targetUserId } = req.body;
    const ownerId = requireUserId(req, res);
    if (!ownerId) return;

    await grpcCall(gameClient.MutePlayer.bind(gameClient), {
      table_id: tableId,
      owner_id: ownerId,
      target_user_id: targetUserId,
    });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to mute player");
    return res.status(500).json({ error: "Failed to mute player" });
  }
});

// POST /api/tables/:tableId/unmute - Unmute a player (owner only)
router.post("/:tableId/unmute", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { targetUserId } = req.body;
    const ownerId = requireUserId(req, res);
    if (!ownerId) return;

    await grpcCall(gameClient.UnmutePlayer.bind(gameClient), {
      table_id: tableId,
      owner_id: ownerId,
      target_user_id: targetUserId,
    });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to unmute player");
    return res.status(500).json({ error: "Failed to unmute player" });
  }
});

export default router;
