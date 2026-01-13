import { Router, json } from "express";
import { register } from "prom-client";
import { authMiddleware } from "./middleware/auth";
import { httpRateLimitMiddleware } from "./middleware/rateLimit";
import { setupProxy } from "./proxy";
import { getRedisClient } from "../storage/redisClient";
import tablesRouter from "./routes/tables";
import profileRouter from "./routes/profile";
import auditRouter from "./routes/audit";

export function createRouter(): Router {
  const router = Router();

  // Body parsing
  router.use(json());

  // Metrics (Unauthenticated)
  router.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  // Health (Unauthenticated)
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "gateway" });
  });

  router.get("/ready", async (_req, res) => {
    const redis = await getRedisClient();
    if (!redis) {
      return res.status(503).json({ status: "degraded", reason: "redis_unavailable" });
    }
    try {
      await redis.ping();
      return res.json({ status: "ready" });
    } catch {
      return res.status(503).json({ status: "degraded", reason: "redis_unreachable" });
    }
  });

  // Auth Middleware
  router.use(authMiddleware);

  // Rate Limiting
  router.use(httpRateLimitMiddleware);

  // HTTP-to-gRPC Routes (for gRPC-only backend services)
  router.use("/api/tables", tablesRouter);
  router.use("/api", profileRouter); // Handles /api/me, /api/friends, /api/profile/:userId
  router.use("/api/audit", auditRouter);

  // Proxy Routes (for services with HTTP endpoints like Balance)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setupProxy(router as any);

  return router;
}
