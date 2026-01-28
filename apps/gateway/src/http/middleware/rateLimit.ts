import { Request, Response, NextFunction } from "express";
import { incrementRateLimit } from "../../storage/rateLimitStore";
import logger from "../../observability/logger";
import { readIntEnv } from "@specify-poker/shared";

const HTTP_WINDOW_MS = readIntEnv(process.env, "HTTP_RATE_LIMIT_WINDOW_MS", 60_000, { min: 1 });
const HTTP_MAX = readIntEnv(process.env, "HTTP_RATE_LIMIT_MAX", 100, { min: 1 });

export async function httpRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const userId = req.auth?.userId ?? "anonymous";

  // Per IP and Per User limits
  const ipKey = `ratelimit:http:ip:${ip}`;
  const userKey = `ratelimit:http:user:${userId}`;

  try {
    const ipCount = await incrementRateLimit(ipKey, HTTP_WINDOW_MS);
    if (ipCount > HTTP_MAX) {
      return res.status(429).json({ error: "Too many requests from this IP" });
    }

    if (userId !== "anonymous") {
      const userCount = await incrementRateLimit(userKey, HTTP_WINDOW_MS);
      if (userCount > HTTP_MAX) {
        return res.status(429).json({ error: "Too many requests from this user" });
      }
    }

    next();
  } catch (err) {
    logger.error({ err, ip, userId }, "Rate limit middleware error");
    next(); // Fail open for now
  }
}
