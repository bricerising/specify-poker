import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage } from 'http';

let lastWss: MockWebSocketServer | null = null;

function recordWebSocketServer(server: MockWebSocketServer) {
  lastWss = server;
}

class MockWebSocket extends EventEmitter {
  send = vi.fn();
  close = vi.fn();
  ping = vi.fn();
  terminate = vi.fn();
}

class MockWebSocketServer extends EventEmitter {
  lastSocket: MockWebSocket | null = null;
  constructor() {
    super();
    recordWebSocketServer(this);
  }
  handleUpgrade(
    _req: IncomingMessage,
    _socket: unknown,
    _head: Buffer,
    cb: (ws: MockWebSocket) => void,
  ) {
    this.lastSocket = new MockWebSocket();
    cb(this.lastSocket);
  }
}

vi.mock('ws', () => ({
  default: MockWebSocket,
  WebSocketServer: MockWebSocketServer,
}));

const authenticateWs = vi.fn();
const authenticateWsToken = vi.fn();
vi.mock('../../../src/ws/auth', () => ({
  authenticateWs: (...args: unknown[]) => authenticateWs(...args),
  authenticateWsToken: (...args: unknown[]) => authenticateWsToken(...args),
}));

const initWsPubSub = vi.fn();
vi.mock('../../../src/ws/pubsub', () => ({
  initWsPubSub: (...args: unknown[]) => initWsPubSub(...args),
}));

vi.mock('../../../src/ws/handlers/table', () => ({
  createTableHub: vi.fn(() => ({ hubName: 'table', handlers: {} })),
  handleTablePubSubEvent: vi.fn(),
}));

vi.mock('../../../src/ws/handlers/lobby', () => ({
  attachLobbyHub: vi.fn(),
  handleLobbyPubSubEvent: vi.fn(),
}));

vi.mock('../../../src/ws/handlers/chat', () => ({
  createChatHub: vi.fn(() => ({ hubName: 'chat', handlers: {} })),
  handleChatPubSubEvent: vi.fn(),
}));

const getSubscribedChannels = vi.fn(async () => []);
const unsubscribeAll = vi.fn(async () => {});
vi.mock('../../../src/ws/subscriptions', () => ({
  getSubscribedChannels: (...args: unknown[]) => getSubscribedChannels(...args),
  unsubscribeAll: (...args: unknown[]) => unsubscribeAll(...args),
}));

const registerConnection = vi.fn();
const unregisterConnection = vi.fn();
vi.mock('../../../src/ws/connectionRegistry', () => ({
  registerConnection: (...args: unknown[]) => registerConnection(...args),
  unregisterConnection: (...args: unknown[]) => unregisterConnection(...args),
}));

const updatePresence = vi.fn();
vi.mock('../../../src/storage/sessionStore', () => ({
  updatePresence: (...args: unknown[]) => updatePresence(...args),
}));

const getConnectionsByUser = vi.fn();
vi.mock('../../../src/storage/connectionStore', () => ({
  getConnectionsByUser: (...args: unknown[]) => getConnectionsByUser(...args),
}));

const setupHeartbeat = vi.fn();
vi.mock('../../../src/ws/heartbeat', () => ({
  setupHeartbeat: (...args: unknown[]) => setupHeartbeat(...args),
}));

const PublishEvent = vi.fn(
  (req: unknown, cb: (err: Error | null, response: { success: boolean }) => void) => {
    cb(null, { success: true });
  },
);
vi.mock('../../../src/grpc/clients', () => {
  const gameClient = {};
  const notifyClient = {};
  const eventClient = { PublishEvent };
  const playerClient = { GetProfile: vi.fn() };

  return {
    gameClient,
    notifyClient,
    eventClient,
    playerClient,
    getGameClient: () => gameClient,
    getNotifyClient: () => notifyClient,
    getEventClient: () => eventClient,
    getPlayerClient: () => playerClient,
  };
});

vi.mock('crypto', () => ({
  randomUUID: () => 'conn-1',
}));

vi.mock('../../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('WS server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastWss = null;
  });

  it('rejects non-WS upgrade paths', async () => {
    const { initWsServer } = await import('../../../src/ws/server');
    type UpgradeSocket = { write: (data: string) => void; destroy: () => void };
    let upgradeHandler: (req: IncomingMessage, socket: UpgradeSocket, head: Buffer) => void;
    const server = {
      on: vi.fn((event: string, handler: typeof upgradeHandler) => {
        if (event === 'upgrade') {
          upgradeHandler = handler;
        }
      }),
    };

    await initWsServer(server as unknown as EventEmitter);
    const socket = { write: vi.fn(), destroy: vi.fn() };
    await upgradeHandler(
      { url: '/bad', headers: { host: 'localhost' } } as IncomingMessage,
      socket,
      Buffer.alloc(0),
    );

    expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 404 Not Found\r\n\r\n');
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('closes connection when auth is invalid', async () => {
    authenticateWs.mockResolvedValue({ status: 'invalid', reason: 'invalid_token' });
    const { initWsServer } = await import('../../../src/ws/server');
    let upgradeHandler: (req: IncomingMessage, socket: object, head: Buffer) => void;
    const server = {
      on: vi.fn((event: string, handler: typeof upgradeHandler) => {
        if (event === 'upgrade') {
          upgradeHandler = handler;
        }
      }),
    };

    await initWsServer(server as unknown as EventEmitter);
    await upgradeHandler(
      { url: '/ws?token=bad', headers: { host: 'localhost' } } as IncomingMessage,
      {},
      Buffer.alloc(0),
    );

    await new Promise((resolve) => setImmediate(resolve));
    expect(lastWss?.lastSocket?.close).toHaveBeenCalledWith(1008, 'Unauthorized');
  });

  it('registers connections for valid auth', async () => {
    authenticateWs.mockResolvedValue({ status: 'ok', userId: 'user-1' });
    getConnectionsByUser.mockResolvedValue([]);
    const { initWsServer } = await import('../../../src/ws/server');
    let upgradeHandler: (req: IncomingMessage, socket: object, head: Buffer) => void;
    const server = {
      on: vi.fn((event: string, handler: typeof upgradeHandler) => {
        if (event === 'upgrade') {
          upgradeHandler = handler;
        }
      }),
    };

    await initWsServer(server as unknown as EventEmitter);
    const request = {
      url: '/ws?token=good',
      headers: { host: 'localhost', 'user-agent': 'Mobile Safari' },
      socket: { remoteAddress: '1.2.3.4' },
    } as IncomingMessage;

    await upgradeHandler(request, {}, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));

    expect(registerConnection).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'conn-1', userId: 'user-1', ip: '1.2.3.4' }),
      expect.any(MockWebSocket),
    );
    expect(updatePresence).toHaveBeenCalledWith('user-1', 'online');
    expect(lastWss?.lastSocket?.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'Welcome', userId: 'user-1', connectionId: 'conn-1' }),
    );
    expect(PublishEvent).toHaveBeenCalled();

    lastWss?.lastSocket?.emit('close');
    await new Promise((resolve) => setImmediate(resolve));

    expect(unregisterConnection).toHaveBeenCalledWith('conn-1', 'user-1');
    expect(updatePresence).toHaveBeenCalledWith('user-1', 'offline');
  });

  it('authenticates via the first WS message when token is missing', async () => {
    authenticateWs.mockResolvedValue({ status: 'missing' });
    authenticateWsToken.mockResolvedValue({ status: 'ok', userId: 'user-1' });
    getConnectionsByUser.mockResolvedValue([]);

    const { initWsServer } = await import('../../../src/ws/server');
    let upgradeHandler: (req: IncomingMessage, socket: object, head: Buffer) => void;
    const server = {
      on: vi.fn((event: string, handler: typeof upgradeHandler) => {
        if (event === 'upgrade') {
          upgradeHandler = handler;
        }
      }),
    };

    await initWsServer(server as unknown as EventEmitter);
    const request = {
      url: '/ws',
      headers: { host: 'localhost' },
      socket: { remoteAddress: '1.2.3.4' },
    } as IncomingMessage;

    await upgradeHandler(request, {}, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));

    lastWss?.lastSocket?.emit('message', JSON.stringify({ type: 'Authenticate', token: 'good' }));
    await new Promise((resolve) => setImmediate(resolve));

    expect(authenticateWsToken).toHaveBeenCalledWith('good');
    expect(registerConnection).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'conn-1', userId: 'user-1', ip: '1.2.3.4' }),
      expect.any(MockWebSocket),
    );
    expect(updatePresence).toHaveBeenCalledWith('user-1', 'online');
    expect(lastWss?.lastSocket?.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'Welcome', userId: 'user-1', connectionId: 'conn-1' }),
    );
  });

  it('closes the connection when auth is not provided in time', async () => {
    vi.useFakeTimers();
    try {
      authenticateWs.mockResolvedValue({ status: 'missing' });

      const { initWsServer } = await import('../../../src/ws/server');
      let upgradeHandler: (req: IncomingMessage, socket: object, head: Buffer) => void;
      const server = {
        on: vi.fn((event: string, handler: typeof upgradeHandler) => {
          if (event === 'upgrade') {
            upgradeHandler = handler;
          }
        }),
      };

      await initWsServer(server as unknown as EventEmitter);
      const request = {
        url: '/ws',
        headers: { host: 'localhost' },
        socket: { remoteAddress: '1.2.3.4' },
      } as IncomingMessage;

      await upgradeHandler(request, {}, Buffer.alloc(0));

      vi.advanceTimersByTime(5000);

      expect(lastWss?.lastSocket?.close).toHaveBeenCalledWith(1008, 'Authentication required');
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs shutdown cleanup when setup fails', async () => {
    authenticateWs.mockResolvedValue({ status: 'ok', userId: 'user-1' });
    registerConnection.mockRejectedValue(new Error('redis_down'));

    const { initWsServer } = await import('../../../src/ws/server');
    let upgradeHandler: (req: IncomingMessage, socket: object, head: Buffer) => void;
    const server = {
      on: vi.fn((event: string, handler: typeof upgradeHandler) => {
        if (event === 'upgrade') {
          upgradeHandler = handler;
        }
      }),
    };

    await initWsServer(server as unknown as EventEmitter);
    const request = {
      url: '/ws?token=good',
      headers: { host: 'localhost' },
      socket: { remoteAddress: '1.2.3.4' },
    } as IncomingMessage;

    await upgradeHandler(request, {}, Buffer.alloc(0));
    await new Promise((resolve) => setImmediate(resolve));

    expect(unsubscribeAll).toHaveBeenCalledWith('conn-1');
  });
});
