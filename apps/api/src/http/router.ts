import express from "express";

import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { createAuditRouter } from "./routes/audit";
import { createModerationRouter } from "./routes/moderation";
import { createProfileRouter } from "./routes/profile";
import { createPushRouter } from "./routes/push";
import { createTablesRouter } from "./routes/tables";

export function createRouter() {
  const router = express.Router();
  const allowedOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

  router.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  router.use(express.json());
  router.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept, X-Requested-With",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  router.use("/api", authMiddleware);
  router.use("/api", rateLimitMiddleware);

  router.use(createPushRouter());
  router.use(createTablesRouter());
  router.use(createModerationRouter());
  router.use(createProfileRouter());
  router.use(createAuditRouter());

  return router;
}
