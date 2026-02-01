import { Router, json } from 'express';
import { authMiddleware } from './middleware/auth';
import { httpRateLimitMiddleware } from './middleware/rateLimit';
import { setupProxy } from './proxy';
import { getRedisClient } from '../storage/redisClient';
import { recordHttpRequest } from '../observability/metrics';
import tablesRouter from './routes/tables';
import profileRouter from './routes/profile';
import auditRouter from './routes/audit';
import pushRouter from './routes/push';

function getRouteLabel(req: { baseUrl?: unknown; route?: unknown; path?: unknown }) {
  const baseUrl = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof routePath === 'string') {
    return `${baseUrl}${routePath}`;
  }
  return typeof req.path === 'string' ? req.path : 'unknown';
}

export function createRouter(): Router {
  const router = Router();

  // Body parsing
  router.use(json());

  // HTTP duration metrics (Unauthenticated)
  router.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      recordHttpRequest(req.method, getRouteLabel(req), res.statusCode, Date.now() - startedAt);
    });
    next();
  });

  // Health (Unauthenticated)
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'gateway' });
  });

  router.get('/ready', async (_req, res) => {
    const redis = await getRedisClient();
    if (!redis) {
      return res.status(503).json({ status: 'degraded', reason: 'redis_unavailable' });
    }
    try {
      await redis.ping();
      return res.json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'degraded', reason: 'redis_unreachable' });
    }
  });

  // Auth Middleware
  router.use(authMiddleware);

  // Rate Limiting
  router.use(httpRateLimitMiddleware);

  // HTTP-to-gRPC Routes (for gRPC-only backend services)
  router.use('/api/tables', tablesRouter);
  router.use('/api/audit', auditRouter);
  router.use('/api/push', pushRouter);
  router.use('/api', profileRouter); // Handles /api/me, /api/friends, /api/profile/:userId

  // Proxy Routes (for services with HTTP endpoints like Balance)
  setupProxy(router);

  return router;
}
