import type { IncomingMessage, Server } from 'http';
import type { Socket } from 'net';
import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { context, ROOT_CONTEXT } from '@opentelemetry/api';
import { toStruct } from '@specify-poker/shared';
import type { WsAuthResult } from './auth';
import { authenticateWs, authenticateWsToken } from './auth';
import { registerConnection, unregisterConnection } from './connectionRegistry';
import { initWsPubSub } from './pubsub';
import { attachTableHub, handleTablePubSubEvent } from './handlers/table';
import { attachLobbyHub, handleLobbyPubSubEvent } from './handlers/lobby';
import { attachChatHub, handleChatPubSubEvent } from './handlers/chat';
import { grpc } from '../grpc/unaryClients';
import { updatePresence } from '../storage/sessionStore';
import { getConnectionsByUser } from '../storage/connectionStore';
import { setupHeartbeat } from './heartbeat';
import logger from '../observability/logger';
import { recordWsConnected, recordWsDisconnected } from '../observability/metrics';
import { parseJsonObject } from './messageParsing';
import { safeAsyncHandler } from '../utils/safeAsyncHandler';

interface AuthenticatedRequest extends IncomingMessage {
  wsAuthResult?: WsAuthResult;
}

type ClientType = 'web' | 'mobile';

const sessionMeta = new Map<string, { startedAt: number; clientType: ClientType }>();
const authTimeoutMs = 5000;

function emitSessionEvent(type: string, userId: string, payload: Record<string, unknown>) {
  void grpc.event
    .PublishEvent({
      type,
      table_id: 'lobby',
      user_id: userId,
      payload: toStruct(payload),
      idempotency_key: randomUUID(),
    })
    .then((response) => {
      if (!response.success) {
        logger.error({ type, userId }, 'Failed to emit session event');
      }
    })
    .catch((err: unknown) => {
      logger.error({ err, type, userId }, 'Failed to emit session event');
    });
}

function getClientIp(request: IncomingMessage) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function getClientType(request: IncomingMessage) {
  const ua = request.headers['user-agent'] ?? '';
  if (typeof ua === 'string' && ua.toLowerCase().includes('mobile')) {
    return 'mobile';
  }
  return 'web';
}

function closeWithAuthError(ws: WebSocket, reason: string) {
  ws.close(1008, reason);
}

export async function initWsServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

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

        if (authResult.status === 'invalid') {
          closeWithAuthError(ws, 'Unauthorized');
          return;
        }

        const finalizeConnection = async (userId: string, username?: string) => {
          const connectionId = randomUUID();
          const connectedAt = new Date().toISOString();
          const ip = getClientIp(request);
          const clientType = getClientType(request);

          logger.info({ userId, connectionId }, 'WS connection established');

          if (typeof username === 'string' && username.trim().length > 0) {
            void grpc.player.GetProfile({ user_id: userId, username }).catch((err: unknown) => {
              logger.warn({ err, userId }, 'Failed to sync username on websocket connect');
            });
          }

          await registerConnection({ connectionId, userId, connectedAt, ip }, ws);
          await updatePresence(userId, 'online');

          sessionMeta.set(connectionId, { startedAt: Date.now(), clientType });
          recordWsConnected(clientType);
          emitSessionEvent('SESSION_STARTED', userId, {
            connectionId,
            clientType,
            connectedAt,
          });

          ws.send(JSON.stringify({ type: 'Welcome', userId, connectionId }));

          // Attach hubs
          attachTableHub(ws, userId, connectionId);
          attachLobbyHub(ws, connectionId);
          attachChatHub(ws, userId, connectionId);

          // Heartbeat
          setupHeartbeat(ws, () => {
            logger.info({ userId, connectionId }, 'WS connection timed out');
          });

          ws.on(
            'close',
            safeAsyncHandler<[number, Buffer]>(
              async () => {
                await unregisterConnection(connectionId, userId);
                const remaining = await getConnectionsByUser(userId);
                if (remaining.length === 0) {
                  await updatePresence(userId, 'offline');
                }
                const meta = sessionMeta.get(connectionId);
                sessionMeta.delete(connectionId);
                const durationMs = meta ? Date.now() - meta.startedAt : undefined;
                recordWsDisconnected(meta?.clientType ?? getClientType(request), durationMs);
                emitSessionEvent('SESSION_ENDED', userId, {
                  connectionId,
                  durationMs,
                  clientType: meta?.clientType ?? getClientType(request),
                });
                logger.info({ userId, connectionId }, 'WS connection closed');
              },
              (err) => {
                logger.error({ err, userId, connectionId }, 'ws.close.failed');
              },
            ),
          );

          ws.on('error', (error) => {
            logger.error({ err: error, userId, connectionId }, 'WS connection error');
          });
        };

        if (authResult.status === 'ok') {
          await finalizeConnection(authResult.userId, authResult.username);
          return;
        }

        const authTimer = setTimeout(() => {
          closeWithAuthError(ws, 'Authentication required');
        }, authTimeoutMs);

        ws.once('close', () => {
          clearTimeout(authTimer);
        });

        const handleAuth = safeAsyncHandler<[WebSocket.RawData]>(
          async (data) => {
            clearTimeout(authTimer);
            ws.off('message', handleAuth);

            const message = parseJsonObject(data);
            if (!message) {
              closeWithAuthError(ws, 'Invalid authentication payload');
              return;
            }

            const token = typeof message.token === 'string' ? message.token.trim() : '';
            if (message.type !== 'Authenticate' || token.length === 0) {
              closeWithAuthError(ws, 'Authentication required');
              return;
            }

            const result = await authenticateWsToken(token);
            if (result.status !== 'ok') {
              closeWithAuthError(ws, 'Unauthorized');
              return;
            }

            await finalizeConnection(result.userId, result.username);
          },
          (err) => {
            logger.error({ err }, 'ws.authenticate.failed');
            ws.close(1011, 'Internal error');
          },
        );

        ws.on('message', handleAuth);
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
