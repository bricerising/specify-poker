import { Router, Request, Response } from "express";
import { gameClient } from "../../grpc/clients";
import logger from "../../observability/logger";

const router = Router();

// Helper to convert gRPC callback to promise
function grpcCall<T>(method: string, request: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    (gameClient as any)[method](request, (err: Error | null, response: T) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// GET /api/tables - List all tables
router.get("/", async (_req: Request, res: Response) => {
  try {
    const response = await grpcCall<{ tables: unknown[] }>("ListTables", {});
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
    const ownerId = req.auth?.userId;
    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<unknown>("CreateTable", {
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
    const response = await grpcCall<unknown>("GetTable", { table_id: tableId });
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
    await grpcCall<void>("DeleteTable", { table_id: tableId });
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
    const userId = req.auth?.userId;
    const response = await grpcCall<{ state: unknown; hole_cards: unknown[] }>(
      "GetTableState",
      { table_id: tableId, user_id: userId }
    );
    res.json(response);
  } catch (err) {
    logger.error({ err, tableId: req.params.tableId }, "Failed to get table state");
    res.status(500).json({ error: "Failed to get table state" });
  }
});

// POST /api/tables/:tableId/seats/:seatId/join - Join a seat
router.post("/:tableId/seats/:seatId/join", async (req: Request, res: Response) => {
  try {
    const { tableId, seatId } = req.params;
    const { buyInAmount } = req.body;
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<{ ok: boolean; error?: string }>("JoinSeat", {
      table_id: tableId,
      user_id: userId,
      seat_id: parseInt(seatId, 10),
      buy_in_amount: buyInAmount,
    });

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to join seat" });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to join seat");
    return res.status(500).json({ error: "Failed to join seat" });
  }
});

// POST /api/tables/:tableId/leave - Leave the table
router.post("/:tableId/leave", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<{ ok: boolean; error?: string }>("LeaveSeat", {
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
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<{ ok: boolean; error?: string }>("JoinSpectator", {
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
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<{ ok: boolean; error?: string }>("LeaveSpectator", {
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
    const userId = req.auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const response = await grpcCall<{ ok: boolean; error?: string }>("SubmitAction", {
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

// POST /api/tables/:tableId/kick - Kick a player (owner only)
router.post("/:tableId/kick", async (req: Request, res: Response) => {
  try {
    const { tableId } = req.params;
    const { targetUserId } = req.body;
    const ownerId = req.auth?.userId;
    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await grpcCall<void>("KickPlayer", {
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
    const ownerId = req.auth?.userId;
    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await grpcCall<void>("MutePlayer", {
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
    const ownerId = req.auth?.userId;
    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await grpcCall<void>("UnmutePlayer", {
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
