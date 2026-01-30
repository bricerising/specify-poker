import type WebSocket from 'ws';

import type { WsAuthResult } from './auth';
import { authenticateWsToken } from './auth';
import logger from '../observability/logger';
import { parseJsonObject } from './messageParsing';

export type WsAuthenticatedIdentity = { userId: string; username?: string };

type WsAuthHandshakeOptions = {
  readonly timeoutMs: number;
};

function closeWithAuthError(ws: WebSocket, reason: string) {
  try {
    ws.close(1008, reason);
  } catch {
    // Ignore.
  }
}

function toIdentity(params: { userId: string; username?: string }): WsAuthenticatedIdentity {
  if (params.username) {
    return { userId: params.userId, username: params.username };
  }
  return { userId: params.userId };
}

async function waitForAuthenticateMessage(
  ws: WebSocket,
  options: WsAuthHandshakeOptions,
): Promise<WsAuthenticatedIdentity | null> {
  return await new Promise<WsAuthenticatedIdentity | null>((resolve) => {
    let settled = false;

    const settle = (result: WsAuthenticatedIdentity | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off('close', handleClose);
      ws.off('message', handleMessage);
    };

    const timer = setTimeout(() => {
      closeWithAuthError(ws, 'Authentication required');
      settle(null);
    }, options.timeoutMs);

    const handleClose = () => {
      settle(null);
    };

    const handleMessage = (data: WebSocket.RawData) => {
      clearTimeout(timer);
      ws.off('message', handleMessage);

      void (async () => {
        try {
          const message = parseJsonObject(data);
          if (!message) {
            closeWithAuthError(ws, 'Invalid authentication payload');
            settle(null);
            return;
          }

          const token = typeof message.token === 'string' ? message.token.trim() : '';
          if (message.type !== 'Authenticate' || token.length === 0) {
            closeWithAuthError(ws, 'Authentication required');
            settle(null);
            return;
          }

          const result = await authenticateWsToken(token);
          if (result.status !== 'ok') {
            closeWithAuthError(ws, 'Unauthorized');
            settle(null);
            return;
          }

          settle(toIdentity(result));
        } catch (err: unknown) {
          logger.error({ err }, 'ws.authenticate.failed');
          try {
            ws.close(1011, 'Internal error');
          } catch {
            // Ignore.
          }
          settle(null);
        }
      })();
    };

    ws.on('close', handleClose);
    ws.on('message', handleMessage);
  });
}

export async function resolveWsAuthIdentity(
  ws: WebSocket,
  authResult: WsAuthResult,
  options: WsAuthHandshakeOptions,
): Promise<WsAuthenticatedIdentity | null> {
  if (authResult.status === 'ok') {
    return toIdentity(authResult);
  }

  if (authResult.status === 'invalid') {
    closeWithAuthError(ws, 'Unauthorized');
    return null;
  }

  return await waitForAuthenticateMessage(ws, options);
}
