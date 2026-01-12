import { Router } from "express";
import { register } from "prom-client";
import { authMiddleware } from "./middleware/auth";
import { httpRateLimitMiddleware } from "./middleware/rateLimit";
import { setupProxy } from "./proxy";
import { getRedisClient } from "../storage/redisClient";

export function createRouter(): Router {
  const router = Router();

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
    } catch (err) {
      return res.status(503).json({ status: "degraded", reason: "redis_unreachable" });
    }
  });

  // Auth Middleware
  router.use(authMiddleware);

  // Rate Limiting
  router.use(httpRateLimitMiddleware);

  // Proxy Routes
  setupProxy(router as any);

  return router;
}
