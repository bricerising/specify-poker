import express from "express";

import { getTracer } from "../../observability/otel";
import { createDefaultTable, createTable, listTables } from "../../services/tableRegistry";
import { joinSeat, leaveSeat } from "../../services/tableService";
import { broadcastTableState } from "../../ws/tableHub";

export function createTablesRouter() {
  const router = express.Router();

  router.get("/api/tables", async (_req, res) => {
    await createDefaultTable();
    res.status(200).json(await listTables());
  });

  router.post("/api/tables", async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ code: "auth_denied", message: "Missing auth" });
    }

    const name = String(req.body?.name ?? "").trim();
    const config = req.body?.config ?? {};
    const smallBlind = Number(config.smallBlind);
    const bigBlind = Number(config.bigBlind);
    const maxPlayers = Number(config.maxPlayers);
    const startingStack = Number(config.startingStack);
    const anteInput = config.ante;
    const ante = anteInput === undefined || anteInput === null ? anteInput : Number(anteInput);

    if (!name) {
      return res.status(400).json({ code: "invalid_name", message: "name required" });
    }
    if (!Number.isFinite(smallBlind) || smallBlind <= 0) {
      return res.status(400).json({ code: "invalid_small_blind", message: "smallBlind required" });
    }
    if (!Number.isFinite(bigBlind) || bigBlind < smallBlind * 2) {
      return res
        .status(400)
        .json({ code: "invalid_big_blind", message: "bigBlind must be >= 2 * smallBlind" });
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 9) {
      return res
        .status(400)
        .json({ code: "invalid_max_players", message: "maxPlayers must be 2-9" });
    }
    if (!Number.isFinite(startingStack) || startingStack <= 0) {
      return res.status(400).json({ code: "invalid_starting_stack", message: "startingStack required" });
    }
    if (ante !== undefined && ante !== null) {
      if (!Number.isFinite(ante) || ante < 0) {
        return res.status(400).json({ code: "invalid_ante", message: "ante must be >= 0" });
      }
      if (ante >= smallBlind) {
        return res.status(400).json({ code: "invalid_ante", message: "ante must be < smallBlind" });
      }
    }

    const summary = await createTable({
      name,
      ownerId: auth.userId,
      config: {
        smallBlind,
        bigBlind,
        ...(ante !== undefined ? { ante } : {}),
        maxPlayers,
        startingStack,
        bettingStructure: "NoLimit",
      },
    });

    const span = getTracer().startSpan("poker.table.create", {
      attributes: {
        "poker.table_id": summary.tableId,
        "poker.user_id": auth.userId,
      },
    });
    span.end();

    return res.status(201).json(summary);
  });

  router.post("/api/tables/:tableId/join", async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ code: "auth_denied", message: "Missing auth" });
    }

    const seatId = Number(req.body?.seatId);
    if (!Number.isInteger(seatId)) {
      return res.status(400).json({ code: "invalid_seat", message: "seatId required" });
    }

    const result = await joinSeat({
      tableId: req.params.tableId,
      seatId,
      userId: auth.userId,
    });

    if (!result.ok) {
      return res.status(409).json({ code: result.reason, message: "Seat unavailable" });
    }

    await broadcastTableState(req.params.tableId);

    const protocol = req.secure ? "wss" : "ws";
    const host = req.headers.host ?? "localhost:4000";
    const wsUrl = `${protocol}://${host}/ws?token=${auth.token}`;

    const span = getTracer().startSpan("poker.table.join", {
      attributes: {
        "poker.table_id": req.params.tableId,
        "poker.user_id": auth.userId,
        "poker.seat_id": seatId,
      },
    });
    span.end();

    return res.status(200).json({
      tableId: req.params.tableId,
      seatId,
      wsUrl,
    });
  });

  router.post("/api/tables/:tableId/leave", async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      return res.status(401).json({ code: "auth_denied", message: "Missing auth" });
    }

    const result = await leaveSeat({ tableId: req.params.tableId, userId: auth.userId });
    if (!result.ok) {
      return res.status(404).json({ code: result.reason, message: "Not seated" });
    }

    await broadcastTableState(req.params.tableId);

    return res.status(204).send();
  });

  return router;
}
