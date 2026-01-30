import type { Request, Response } from 'express';
import { requireUserId } from './requireUserId';
import { safeRoute, type RouteHandler, type SafeRouteOptions } from './safeRoute';

export type AuthedRouteHandler = (
  req: Request,
  res: Response,
  userId: string,
) => Promise<void> | void;

export function safeAuthedRoute(handler: AuthedRouteHandler, options: SafeRouteOptions): RouteHandler {
  return safeRoute(async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) {
      return;
    }

    await handler(req, res, userId);
  }, options);
}

