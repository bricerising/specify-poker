import type { Request, Response } from 'express';
import { Router } from 'express';
import { isRedisEnabled, getRedisClient } from '../../../storage/redisClient';
import logger from '../../../observability/logger';
import { nowIso } from '../../../utils/time';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  let redisConnected = false;

  if (isRedisEnabled()) {
    try {
      const client = await getRedisClient();
      if (client) {
        await client.ping();
        redisConnected = true;
      }
    } catch {
      logger.warn('redis.health.check.failed');
      redisConnected = false;
    }
  }

  const status = isRedisEnabled() && !redisConnected ? 'degraded' : 'healthy';

  res.json({
    status,
    timestamp: nowIso(),
    redis: redisConnected,
  });
});

router.get('/ready', async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'test') {
    return res.json({ ready: true });
  }

  if (!isRedisEnabled()) {
    return res.json({ ready: true });
  }

  const client = await getRedisClient();
  if (!client) {
    return res.status(503).json({ ready: false, reason: 'redis_unavailable' });
  }

  try {
    await client.ping();
    return res.json({ ready: true });
  } catch {
    return res.status(503).json({ ready: false, reason: 'redis_unreachable' });
  }
});

export default router;
