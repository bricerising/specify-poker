import { Router, Request, Response } from "express";
import { isRedisEnabled, getRedisClient } from "../../../storage/redisClient";

const router = Router();

router.get("/health", async (req: Request, res: Response) => {
  let redisConnected = false;

  if (isRedisEnabled()) {
    try {
      const client = await getRedisClient();
      if (client) {
        await client.ping();
        redisConnected = true;
      }
    } catch {
      redisConnected = false;
    }
  }

  const status = isRedisEnabled() && !redisConnected ? "degraded" : "healthy";

  res.json({
    status,
    timestamp: new Date().toISOString(),
    redis: redisConnected,
  });
});

router.get("/ready", async (req: Request, res: Response) => {
  res.json({ ready: true });
});

export default router;
