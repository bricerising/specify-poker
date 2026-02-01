import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type WebSocket from 'ws';
import { createShutdownManager, toStruct } from '@specify-poker/shared';

import type { WsAuthenticatedIdentity } from '../authHandshake';
import { registerConnection, unregisterConnection } from '../connectionRegistry';
import { createTableHub } from '../handlers/table';
import { attachLobbyHub } from '../handlers/lobby';
import { createChatHub } from '../handlers/chat';
import { attachWsMultiplexRouter } from '../router';
import { parseWsClientMessage } from '../clientMessage';
import { getSubscribedChannels, unsubscribeAll } from '../subscriptions';
import { grpc, grpcResult } from '../../grpc/unaryClients';
import { getConfig } from '../../config';
import { getConnectionsByUser } from '../../storage/connectionStore';
import { updatePresence } from '../../storage/sessionStore';
import { setupHeartbeat } from '../heartbeat';
import { recordWsConnected, recordWsDisconnected } from '../../observability/metrics';
import logger from '../../observability/logger';
import { safeAsyncHandler } from '../../utils/safeAsyncHandler';

type ClientType = 'web' | 'mobile';

type WsSetupCommand = {
  readonly name: string;
  execute(): Promise<void>;
};

type WsConnectionFacadeDeps = {
  readonly grpc: typeof grpc;
  readonly grpcResult: typeof grpcResult;
  readonly registerConnection: typeof registerConnection;
  readonly unregisterConnection: typeof unregisterConnection;
  readonly updatePresence: typeof updatePresence;
  readonly getConnectionsByUser: typeof getConnectionsByUser;
  readonly getSubscribedChannels: typeof getSubscribedChannels;
  readonly unsubscribeAll: typeof unsubscribeAll;
  readonly recordWsConnected: typeof recordWsConnected;
  readonly recordWsDisconnected: typeof recordWsDisconnected;
  readonly setupHeartbeat: typeof setupHeartbeat;
  readonly attachLobbyHub: typeof attachLobbyHub;
  readonly createTableHub: typeof createTableHub;
  readonly createChatHub: typeof createChatHub;
  readonly attachWsMultiplexRouter: typeof attachWsMultiplexRouter;
  readonly parseWsClientMessage: typeof parseWsClientMessage;
  readonly logger: Pick<typeof logger, 'info' | 'warn' | 'error'>;
};

export type WsConnectionFacade = {
  finalizeAuthenticatedConnection(params: {
    ws: WebSocket;
    request: IncomingMessage;
    identity: WsAuthenticatedIdentity;
  }): Promise<void>;
};

function getClientIp(request: IncomingMessage): string {
  if (getConfig().trustProxyHops <= 0) {
    return request.socket.remoteAddress ?? 'unknown';
  }

  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.split(',')[0]?.trim() || 'unknown';
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function getClientType(request: IncomingMessage): ClientType {
  const ua = request.headers['user-agent'];
  const uaText = typeof ua === 'string' ? ua : Array.isArray(ua) ? ua[0] : '';
  if (uaText.toLowerCase().includes('mobile')) {
    return 'mobile';
  }
  return 'web';
}

function parseTableIdsFromChannels(channels: string[]): string[] {
  const tableIds = new Set<string>();
  for (const channel of channels) {
    const prefix = 'table:';
    if (!channel.startsWith(prefix)) {
      continue;
    }
    const tableId = channel.slice(prefix.length).trim();
    if (tableId.length > 0) {
      tableIds.add(tableId);
    }
  }
  return [...tableIds];
}

async function runWsSetupCommands(options: {
  commands: ReadonlyArray<WsSetupCommand>;
  shouldAbort(): boolean;
  onAbort(): Promise<void>;
}): Promise<'completed' | 'aborted'> {
  const abortIfRequested = async (): Promise<boolean> => {
    if (!options.shouldAbort()) {
      return false;
    }
    await options.onAbort();
    return true;
  };

  for (const command of options.commands) {
    if (await abortIfRequested()) {
      return 'aborted';
    }

    try {
      await command.execute();
    } catch (err: unknown) {
      throw new Error(`ws.setup.${command.name}.failed`, { cause: err });
    }

    if (await abortIfRequested()) {
      return 'aborted';
    }
  }

  if (await abortIfRequested()) {
    return 'aborted';
  }

  return 'completed';
}

export function createWsConnectionFacade(
  overrides: Partial<WsConnectionFacadeDeps> = {},
): WsConnectionFacade {
  const deps: WsConnectionFacadeDeps = {
    grpc: overrides.grpc ?? grpc,
    grpcResult: overrides.grpcResult ?? grpcResult,
    registerConnection: overrides.registerConnection ?? registerConnection,
    unregisterConnection: overrides.unregisterConnection ?? unregisterConnection,
    updatePresence: overrides.updatePresence ?? updatePresence,
    getConnectionsByUser: overrides.getConnectionsByUser ?? getConnectionsByUser,
    getSubscribedChannels: overrides.getSubscribedChannels ?? getSubscribedChannels,
    unsubscribeAll: overrides.unsubscribeAll ?? unsubscribeAll,
    recordWsConnected: overrides.recordWsConnected ?? recordWsConnected,
    recordWsDisconnected: overrides.recordWsDisconnected ?? recordWsDisconnected,
    setupHeartbeat: overrides.setupHeartbeat ?? setupHeartbeat,
    attachLobbyHub: overrides.attachLobbyHub ?? attachLobbyHub,
    createTableHub: overrides.createTableHub ?? createTableHub,
    createChatHub: overrides.createChatHub ?? createChatHub,
    attachWsMultiplexRouter: overrides.attachWsMultiplexRouter ?? attachWsMultiplexRouter,
    parseWsClientMessage: overrides.parseWsClientMessage ?? parseWsClientMessage,
    logger: overrides.logger ?? logger,
  };

  function emitSessionEvent(type: string, userId: string, payload: Record<string, unknown>) {
    void deps.grpc.event
      .PublishEvent({
        type,
        table_id: 'lobby',
        user_id: userId,
        payload: toStruct(payload),
        idempotency_key: randomUUID(),
      })
      .then((response) => {
        if (!response.success) {
          deps.logger.error({ type, userId }, 'Failed to emit session event');
        }
      })
      .catch((err: unknown) => {
        deps.logger.error({ err, type, userId }, 'Failed to emit session event');
      });
  }

  async function finalizeAuthenticatedConnection(params: {
    ws: WebSocket;
    request: IncomingMessage;
    identity: WsAuthenticatedIdentity;
  }): Promise<void> {
    const { ws, request, identity } = params;

    const connectionId = randomUUID();
    const connectedAt = new Date().toISOString();
    const ip = getClientIp(request);
    const clientType = getClientType(request);
    let startedAt = 0;

    const shutdown = createShutdownManager({ logger: deps.logger });
    let closeRequested = false;
    let setupComplete = false;

    shutdown.add('ws.connection.closed.log', async () => {
      deps.logger.info({ userId: identity.userId, connectionId }, 'WS connection closed');
    });

    // Cleanup: Subscriptions and spectator state.
    //
    // Added early so it's always registered, even if the connection closes during setup.
    // Added in this order because shutdown runs in reverse.
    shutdown.add('ws.subscriptions.unsubscribeAll', async () => {
      await deps.unsubscribeAll(connectionId);
    });
    shutdown.add('ws.spectator.leaveAll', async () => {
      const channels = await deps.getSubscribedChannels(connectionId);
      const tableIds = parseTableIdsFromChannels(channels);
      if (tableIds.length === 0) {
        return;
      }

      void Promise.all(
        tableIds.map((tableId) =>
          deps.grpcResult.game
            .LeaveSpectator({
              table_id: tableId,
              user_id: identity.userId,
              idempotency_key: `ws:${connectionId}:Shutdown:LeaveSpectator:${tableId}`,
            })
            .catch(() => null),
        ),
      );
    });

    ws.on(
      'close',
      safeAsyncHandler(
        async () => {
          closeRequested = true;
          if (!setupComplete) {
            return;
          }
          await shutdown.run();
        },
        (err) => {
          deps.logger.error({ err, userId: identity.userId, connectionId }, 'ws.close.failed');
        },
      ),
    );

    deps.logger.info({ userId: identity.userId, connectionId }, 'WS connection established');

    const commands: WsSetupCommand[] = [
      {
        name: 'profile.sync',
        execute: async () => {
          if (typeof identity.username !== 'string' || identity.username.trim().length === 0) {
            return;
          }

          void deps.grpc.player
            .GetProfile({ user_id: identity.userId, username: identity.username })
            .catch((err: unknown) => {
              deps.logger.warn(
                { err, userId: identity.userId },
                'Failed to sync username on websocket connect',
              );
            });
        },
      },
      {
        name: 'connection.register',
        execute: async () => {
          await deps.registerConnection(
            { connectionId, userId: identity.userId, connectedAt, ip },
            ws,
          );
          shutdown.add('ws.presence.offline', async () => {
            const remaining = await deps.getConnectionsByUser(identity.userId);
            if (remaining.length === 0) {
              await deps.updatePresence(identity.userId, 'offline');
            }
          });
          shutdown.add('ws.connection.unregister', async () => {
            await deps.unregisterConnection(connectionId, identity.userId);
          });
        },
      },
      {
        name: 'presence.online',
        execute: async () => {
          await deps.updatePresence(identity.userId, 'online');
        },
      },
      {
        name: 'metrics.connected',
        execute: async () => {
          startedAt = Date.now();
          deps.recordWsConnected(clientType);
          shutdown.add('ws.metrics.disconnected', async () => {
            deps.recordWsDisconnected(clientType, Date.now() - startedAt);
          });
        },
      },
      {
        name: 'session.started',
        execute: async () => {
          emitSessionEvent('SESSION_STARTED', identity.userId, {
            connectionId,
            clientType,
            connectedAt,
          });
          shutdown.add('ws.session.ended', async () => {
            emitSessionEvent('SESSION_ENDED', identity.userId, {
              connectionId,
              durationMs: Date.now() - startedAt,
              clientType,
            });
          });
        },
      },
      {
        name: 'send.welcome',
        execute: async () => {
          try {
            ws.send(JSON.stringify({ type: 'Welcome', userId: identity.userId, connectionId }));
          } catch {
            // Ignore.
          }
        },
      },
      {
        name: 'hubs.attach',
        execute: async () => {
          deps.attachWsMultiplexRouter(ws, {
            parseMessage: deps.parseWsClientMessage,
            hubs: [
              deps.createTableHub({ connectionId, userId: identity.userId }),
              deps.createChatHub({ connectionId, userId: identity.userId }),
            ],
          });
          await deps.attachLobbyHub(ws, connectionId);
        },
      },
      {
        name: 'heartbeat.setup',
        execute: async () => {
          deps.setupHeartbeat(ws, () => {
            deps.logger.info({ userId: identity.userId, connectionId }, 'WS connection timed out');
          });

          ws.on('error', (error) => {
            deps.logger.error(
              { err: error, userId: identity.userId, connectionId },
              'WS connection error',
            );
          });
        },
      },
    ];

    try {
      const result = await runWsSetupCommands({
        commands,
        shouldAbort: () => closeRequested,
        onAbort: () => shutdown.run(),
      });

      if (result === 'aborted') {
        return;
      }

      setupComplete = true;

      if (closeRequested) {
        await shutdown.run();
      }
    } catch (err: unknown) {
      await shutdown.run();
      throw err;
    }
  }

  return { finalizeAuthenticatedConnection };
}
