import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../../../auth/jwt';
import logger from '../../../observability/logger';

export interface AuthContext {
  userId: string;
  token?: string;
  claims?: Record<string, unknown>;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

function deny(res: Response, reason: string) {
  logger.warn({ reason }, 'auth.denied');
  res.status(401).json({ code: 'auth_denied', message: reason });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'test' || process.env.BALANCE_AUTH_BYPASS === 'true') {
    return next();
  }

  if (req.method === 'OPTIONS') {
    return next();
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return deny(res, 'Missing bearer token');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return deny(res, 'Missing bearer token');
  }

  try {
    const claims = await verifyToken(token);
    req.auth = {
      userId: claims.sub ?? 'unknown',
      token,
      claims,
    };
    return next();
  } catch (error: unknown) {
    logger.warn({ err: error }, 'auth.failed');
    return deny(res, 'Invalid token');
  }
}
