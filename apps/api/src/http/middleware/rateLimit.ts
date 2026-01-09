import { NextFunction, Request, Response } from "express";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function getWindowMs() {
  return Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000);
}

function getMaxRequests() {
  return Number(process.env.RATE_LIMIT_MAX ?? 60);
}

function getBucket(key: string, now: number) {
  const existing = buckets.get(key);
  if (existing && existing.resetAt > now) {
    return existing;
  }
  const next = { count: 0, resetAt: now + getWindowMs() };
  buckets.set(key, next);
  return next;
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.auth?.userId ?? req.ip ?? "anonymous";
  const now = Date.now();
  const bucket = getBucket(key, now);
  bucket.count += 1;

  if (bucket.count > getMaxRequests()) {
    res
      .status(429)
      .json({ code: "rate_limited", message: "Too many requests, slow down." });
    return;
  }

  next();
}

export function resetRateLimit() {
  buckets.clear();
}
