import { Router, Request, Response } from "express";
import { seatIdSchema, tableCreateRequestInputSchema, tableJoinSeatRequestSchema } from "@specify-poker/shared";
import { gameClient } from "../../grpc/clients";
import { grpcCall } from "../../grpc/grpcCall";
import logger from "../../observability/logger";
import { getConfig } from "../../config";
import { requireUserId } from "../utils/requireUserId";

const router = Router();

const DAILY_LOGIN_BONUS_CHIPS = 1000;

function buildWsUrl(req: Request) {
  const host = req.get("host");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" ? forwardedProto : req.protocol;
  const wsProtocol = protocol === "https" ? "wss" : "ws";
  return `${wsProtocol}://${host}/ws`;
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function balanceBaseUrl(): string {
  const config = getConfig();
  return config.balanceServiceHttpUrl.startsWith("http")
    ? config.balanceServiceHttpUrl
    : `http://${config.balanceServiceHttpUrl}`;
}

async function ensureDailyLoginBonus(userId: string): Promise<void> {
  const date = isoDate();
  const idempotencyKey = `bonus:daily_login:lobby:${userId}:${date}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);

  try {
    const response = await fetch(
      `${balanceBaseUrl()}/api/accounts/${encodeURIComponent(userId)}/deposit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "x-gateway-user-id": userId,
        },
        body: JSON.stringify({ amount: DAILY_LOGIN_BONUS_CHIPS, source: "BONUS" }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn(
        { userId, status: response.status, body },
        "daily_login_bonus.failed",
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    logger.warn({ userId, message }, "daily_login_bonus.error");
  } finally {
    clearTimeout(timeout);
  }
}

function seatUserId(seat: unknown): string | null {
  if (!seat || typeof seat !== "object") {
    return null;
  }
  const record = seat as Record<string, unknown>;
  const userId = record.user_id ?? record.userId;
  return typeof userId === "string" && userId.trim().length > 0 ? userId : null;
}

type JoinSeatResponse = { ok: boolean; error?: string };

const DAILY_LOGIN_BONUS_ERRORS = new Set(["ACCOUNT_NOT_FOUND", "INSUFFICIENT_BALANCE"]);

async function joinSeatWithDailyBonus(request: {
  table_id: string;
  user_id: string;
  seat_id: number;
  buy_in_amount: number;
}): Promise<JoinSeatResponse> {
  let response = (await grpcCall(gameClient.JoinSeat.bind(gameClient), request)) as JoinSeatResponse;
  if (!response.ok && DAILY_LOGIN_BONUS_ERRORS.has(response.error ?? "")) {
    await ensureDailyLoginBonus(request.user_id);
    response = (await grpcCall(gameClient.JoinSeat.bind(gameClient), request)) as JoinSeatResponse;
  }
  return response;
}

async function resolveTargetUserIdBySeatId(params: {
  tableId: string;
  ownerId: string;
  seatId: number;
}): Promise<string | null> {
  const stateResponse = await grpcCall(gameClient.GetTableState.bind(gameClient), {
    table_id: params.tableId,
    user_id: params.ownerId,
  });
  const seats = (stateResponse.state?.seats ?? []) as unknown[];
  const targetSeat = seats.find((seat) => {
    if (!seat || typeof seat !== "object") return false;
    const record = seat as Record<string, unknown>;
    const id = record.seat_id ?? record.seatId;
    return Number(id) === params.seatId;
  });

  return seatUserId(targetSeat);
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
    const parsed = tableCreateRequestInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const { name, config } = parsed.data;
    const ownerId = requireUserId(req, res);
    if (!ownerId) return;

    const response = await grpcCall(gameClient.CreateTable.bind(gameClient), {
      name,
      owner_id: ownerId,
      config: {
        small_blind: config.smallBlind,
        big_blind: config.bigBlind,
        ante: config.ante ?? 0,
        max_players: config.maxPlayers,
        starting_stack: config.startingStack,
        turn_timer_seconds: config.turnTimerSeconds ?? 20,
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
    const parsed = tableJoinSeatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "seatId is required" });
    }

    const { seatId, buyInAmount } = parsed.data;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const joinRequest: Parameters<typeof joinSeatWithDailyBonus>[0] = {
      table_id: tableId,
      user_id: userId,
      seat_id: seatId,
      buy_in_amount: buyInAmount ?? 0,
    };

    const response = await joinSeatWithDailyBonus(joinRequest);

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to join seat" });
    }
    return res.json({ tableId, seatId, wsUrl: buildWsUrl(req) });
  } catch (err) {
    logger.error({ err }, "Failed to join seat");
    return res.status(500).json({ error: "Failed to join seat" });
  }
});

// POST /api/tables/:tableId/seats/:seatId/join - Join a seat
router.post("/:tableId/seats/:seatId/join", async (req: Request, res: Response) => {
  try {
    const { tableId, seatId } = req.params;
    const parsed = tableJoinSeatRequestSchema.safeParse({
      seatId,
      buyInAmount: req.body?.buyInAmount,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "seatId is required" });
    }

    const { seatId: parsedSeatId, buyInAmount } = parsed.data;
    const userId = requireUserId(req, res);
    if (!userId) return;

    const joinRequest: Parameters<typeof joinSeatWithDailyBonus>[0] = {
      table_id: tableId,
      user_id: userId,
      seat_id: parsedSeatId,
      buy_in_amount: buyInAmount ?? 0,
    };

    const response = await joinSeatWithDailyBonus(joinRequest);

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to join seat" });
    }
    return res.json({ tableId, seatId: parsedSeatId, wsUrl: buildWsUrl(req) });
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

    const seatIdParsed = seatIdSchema.safeParse(req.body?.seatId);
    if (!seatIdParsed.success) {
      return res.status(400).json({ error: "seatId is required" });
    }
    const seatId = seatIdParsed.data;

    const targetUserId = await resolveTargetUserIdBySeatId({ tableId, ownerId, seatId });
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

    const seatIdParsed = seatIdSchema.safeParse(req.body?.seatId);
    if (!seatIdParsed.success) {
      return res.status(400).json({ error: "seatId is required" });
    }
    const seatId = seatIdParsed.data;

    const targetUserId = await resolveTargetUserIdBySeatId({ tableId, ownerId, seatId });
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

    if (typeof targetUserId !== "string" || targetUserId.trim().length === 0) {
      return res.status(400).json({ error: "targetUserId is required" });
    }

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

    if (typeof targetUserId !== "string" || targetUserId.trim().length === 0) {
      return res.status(400).json({ error: "targetUserId is required" });
    }

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

    if (typeof targetUserId !== "string" || targetUserId.trim().length === 0) {
      return res.status(400).json({ error: "targetUserId is required" });
    }

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
