import type { IncomingMessage, Server } from 'http';
import type { Socket } from 'net';
import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { context, ROOT_CONTEXT } from '@opentelemetry/api';
import type { WsAuthResult } from './auth';
import { authenticateWs } from './auth';
import { resolveWsAuthIdentity } from './authHandshake';
import { initWsPubSub } from './pubsub';
import { handleTablePubSubEvent } from './handlers/table';
import { handleLobbyPubSubEvent } from './handlers/lobby';
import { handleChatPubSubEvent } from './handlers/chat';
import { createWsConnectionFacade } from './connection/facade';
import logger from '../observability/logger';
import { safeAsyncHandler } from '../utils/safeAsyncHandler';

interface AuthenticatedRequest extends IncomingMessage {
  wsAuthResult?: WsAuthResult;
}

const authTimeoutMs = 5000;

export async function initWsServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  const connectionFacade = createWsConnectionFacade();

  await initWsPubSub({
    onTableEvent: handleTablePubSubEvent,
    onChatEvent: handleChatPubSubEvent,
    onTimerEvent: handleTablePubSubEvent,
    onLobbyEvent: handleLobbyPubSubEvent,
  });

  server.on(
    'upgrade',
    safeAsyncHandler<[IncomingMessage, Socket, Buffer]>(
      async (request, socket, head) => {
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        if (url.pathname !== '/ws') {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
          return;
        }

        const authResult = await authenticateWs(request);
        (request as AuthenticatedRequest).wsAuthResult = authResult;

        context.with(ROOT_CONTEXT, () => {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        });
      },
      (err, request, socket) => {
        logger.error({ err, url: request.url }, 'ws.upgrade.failed');
        try {
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        } catch {
          // Ignore.
        }
        socket.destroy();
      },
    ),
  );

  wss.on(
    'connection',
    safeAsyncHandler<[WebSocket, IncomingMessage]>(
      async (ws, request) => {
        const authResult = (request as AuthenticatedRequest).wsAuthResult;
        if (!authResult) {
          ws.close(1011, 'Authentication unavailable');
          return;
        }

        const identity = await resolveWsAuthIdentity(ws, authResult, { timeoutMs: authTimeoutMs });
        if (!identity) {
          return;
        }

        await connectionFacade.finalizeAuthenticatedConnection({ ws, request, identity });
      },
      (err, ws, request) => {
        logger.error({ err, url: request.url }, 'ws.connection.failed');
        try {
          ws.close(1011, 'Internal error');
        } catch {
          // Ignore.
        }
      },
    ),
  );

  return wss;
}
