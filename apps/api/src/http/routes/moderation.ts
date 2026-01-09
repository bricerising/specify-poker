import express from "express";

import { getTable } from "../../services/tableRegistry";
import { getTableState } from "../../services/tableState";
import { leaveSeat } from "../../services/tableService";
import { muteUser } from "../../services/moderationService";
import { broadcastTableState } from "../../ws/tableHub";

function requireAuth(req: express.Request, res: express.Response) {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ code: "auth_denied", message: "Missing auth" });
    return null;
  }
  return auth;
}

export function createModerationRouter() {
  const router = express.Router();

  router.post("/api/tables/:tableId/moderation/kick", async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) {
      return;
    }

    const table = await getTable(req.params.tableId);
    if (!table) {
      return res.status(404).json({ code: "missing_table", message: "Table not found" });
    }
    if (table.ownerId !== auth.userId) {
      return res.status(403).json({ code: "forbidden", message: "Owner only" });
    }

    const seatId = Number(req.body?.seatId);
    if (!Number.isInteger(seatId)) {
      return res.status(400).json({ code: "invalid_seat", message: "seatId required" });
    }

    const tableState = await getTableState(req.params.tableId);
    const seat = tableState?.seats.find((entry) => entry.seatId === seatId);
    if (!seat || !seat.userId) {
      return res.status(404).json({ code: "seat_empty", message: "Seat empty" });
    }

    const targetUserId = seat.userId;
    const result = await leaveSeat({ tableId: req.params.tableId, userId: targetUserId });
    if (!result.ok) {
      return res.status(409).json({ code: result.reason, message: "Unable to kick" });
    }

    console.log("moderation.action", {
      action: "kick",
      tableId: req.params.tableId,
      seatId,
      userId: targetUserId,
      by: auth.userId,
    });

    await broadcastTableState(req.params.tableId);

    return res.status(200).json({
      tableId: req.params.tableId,
      seatId,
      userId: targetUserId,
      action: "kick",
      tableState: result.tableState,
    });
  });

  router.post("/api/tables/:tableId/moderation/mute", async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) {
      return;
    }

    const table = await getTable(req.params.tableId);
    if (!table) {
      return res.status(404).json({ code: "missing_table", message: "Table not found" });
    }
    if (table.ownerId !== auth.userId) {
      return res.status(403).json({ code: "forbidden", message: "Owner only" });
    }

    const seatId = Number(req.body?.seatId);
    if (!Number.isInteger(seatId)) {
      return res.status(400).json({ code: "invalid_seat", message: "seatId required" });
    }

    const tableState = await getTableState(req.params.tableId);
    const seat = tableState?.seats.find((entry) => entry.seatId === seatId);
    if (!seat || !seat.userId) {
      return res.status(404).json({ code: "seat_empty", message: "Seat empty" });
    }

    const targetUserId = seat.userId;
    await muteUser(req.params.tableId, targetUserId);

    console.log("moderation.action", {
      action: "mute",
      tableId: req.params.tableId,
      seatId,
      userId: targetUserId,
      by: auth.userId,
    });

    return res.status(200).json({
      tableId: req.params.tableId,
      seatId,
      userId: targetUserId,
      action: "mute",
    });
  });

  return router;
}
