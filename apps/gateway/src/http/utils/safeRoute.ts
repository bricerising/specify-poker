import type { Request, Response } from 'express';
import logger from '../../observability/logger';
import { safeAsyncHandler } from '../../utils/safeAsyncHandler';

export type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

type SafeRouteOptions = {
  readonly logMessage: string;
  readonly errorMessage?: string;
  readonly status?: number;
  readonly getLogContext?: (req: Request) => Record<string, unknown>;
};

export function safeRoute(handler: RouteHandler, options: SafeRouteOptions): RouteHandler {
  const status = options.status ?? 500;
  const errorMessage = options.errorMessage ?? options.logMessage;

  return safeAsyncHandler(handler, (err, req, res) => {
    const context = options.getLogContext?.(req) ?? {};
    logger.error({ err, ...context }, options.logMessage);

    if (res.headersSent) {
      return;
    }

    res.status(status).json({ error: errorMessage });
  });
}
