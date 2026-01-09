import express from "express";

import { authMiddleware } from "./middleware/auth";
import { createAuditRouter } from "./routes/audit";
import { createModerationRouter } from "./routes/moderation";
import { createPushRouter } from "./routes/push";
import { createTablesRouter } from "./routes/tables";

export function createRouter() {
  const router = express.Router();

  router.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  router.use(express.json());
  router.use("/api", authMiddleware);

  router.get("/api/me", (req, res) => {
    const userId = req.auth?.userId ?? "unknown";
    const nickname = (req.auth?.claims?.preferred_username as string | undefined) ?? userId;
    const avatarUrl = (req.auth?.claims?.picture as string | undefined) ?? null;

    res.status(200).json({
      userId,
      nickname,
      avatarUrl,
      stats: { handsPlayed: 0, wins: 0 },
      friends: [],
    });
  });

  router.use(createPushRouter());
  router.use(createTablesRouter());
  router.use(createModerationRouter());
  router.use(createAuditRouter());

  return router;
}
