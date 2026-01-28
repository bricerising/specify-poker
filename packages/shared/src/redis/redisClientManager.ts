import { createClient as createRedisClient, type RedisClientType } from 'redis';

export type RedisClient = RedisClientType;

export type RedisClientLogFn = (obj: Record<string, unknown>, msg: string) => void;

export type RedisClientLogger = {
  info?: RedisClientLogFn;
  warn?: RedisClientLogFn;
  error?: RedisClientLogFn;
};

export type RedisClientManager = {
  isEnabled(): boolean;
  getClient(): Promise<RedisClient>;
  getClientOrNull(): Promise<RedisClient | null>;
  getBlockingClient(): Promise<RedisClient>;
  getBlockingClientOrNull(): Promise<RedisClient | null>;
  close(): Promise<void>;
};

type CreateRedisClientManagerOptions = {
  url: string | null;
  createClient?: typeof createRedisClient;
  log?: RedisClientLogger;
  name?: string;
};

export function createRedisClientManager(
  options: CreateRedisClientManagerOptions,
): RedisClientManager {
  const url = options.url;
  const name = options.name ?? 'redis';
  const log = options.log;
  const createClient = options.createClient ?? createRedisClient;

  let client: RedisClient | null = null;
  let clientPromise: Promise<RedisClient> | null = null;

  let blockingClient: RedisClient | null = null;
  let blockingPromise: Promise<RedisClient> | null = null;

  let closePromise: Promise<void> | null = null;

  const logWarn = (obj: Record<string, unknown>, msg: string) => {
    (log?.warn ?? log?.error)?.(obj, msg);
  };

  const logError = (obj: Record<string, unknown>, msg: string) => {
    (log?.error ?? log?.warn)?.(obj, msg);
  };

  const requireUrl = (): string => {
    if (!url) {
      throw new Error(`${name}.not_configured`);
    }
    return url;
  };

  const attachErrorHandler = (nextClient: RedisClient, kind: 'client' | 'blocking') => {
    nextClient.on('error', (err: unknown) => {
      logError({ err, name, kind }, 'redis.error');
    });
  };

  const connectClient = (): Promise<RedisClient> => {
    const redisUrl = requireUrl();

    if (client) {
      return Promise.resolve(client);
    }

    if (clientPromise) {
      return clientPromise;
    }

    const nextClient = createClient<
      Record<string, never>,
      Record<string, never>,
      Record<string, never>
    >({ url: redisUrl });
    attachErrorHandler(nextClient, 'client');

    const promise = nextClient
      .connect()
      .then(() => {
        client = nextClient;
        return nextClient;
      })
      .catch((err: unknown) => {
        clientPromise = null;
        client = null;
        safeDisconnect(nextClient);
        throw err;
      });

    clientPromise = promise;
    return promise;
  };

  const connectBlockingClient = (): Promise<RedisClient> => {
    const redisUrl = requireUrl();

    if (blockingClient) {
      return Promise.resolve(blockingClient);
    }

    if (blockingPromise) {
      return blockingPromise;
    }

    const nextBlockingClient = client
      ? client.duplicate()
      : createClient<Record<string, never>, Record<string, never>, Record<string, never>>({
          url: redisUrl,
        });
    attachErrorHandler(nextBlockingClient, 'blocking');

    const promise = nextBlockingClient
      .connect()
      .then(() => {
        blockingClient = nextBlockingClient;
        return nextBlockingClient;
      })
      .catch((err: unknown) => {
        blockingPromise = null;
        blockingClient = null;
        safeDisconnect(nextBlockingClient);
        throw err;
      });

    blockingPromise = promise;
    return promise;
  };

  const getClientOrNull = async (): Promise<RedisClient | null> => {
    if (!url) {
      return null;
    }
    try {
      return await connectClient();
    } catch (err: unknown) {
      logWarn({ err, name }, 'redis.connect.failed');
      return null;
    }
  };

  const getBlockingClientOrNull = async (): Promise<RedisClient | null> => {
    if (!url) {
      return null;
    }
    try {
      return await connectBlockingClient();
    } catch (err: unknown) {
      logWarn({ err, name }, 'redis.blocking.connect.failed');
      return null;
    }
  };

  const close = async (): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }

    closePromise = (async () => {
      const [resolvedBlocking, resolvedClient] = await Promise.all([
        blockingPromise?.catch(() => null) ?? Promise.resolve(null),
        clientPromise?.catch(() => null) ?? Promise.resolve(null),
      ]);

      await safeQuit(resolvedBlocking ?? blockingClient, { logWarn, name, kind: 'blocking' });
      await safeQuit(resolvedClient ?? client, { logWarn, name, kind: 'client' });

      blockingClient = null;
      blockingPromise = null;
      client = null;
      clientPromise = null;
    })().finally(() => {
      closePromise = null;
    });

    return closePromise;
  };

  return {
    isEnabled: () => Boolean(url),
    getClient: () => connectClient(),
    getClientOrNull,
    getBlockingClient: () => connectBlockingClient(),
    getBlockingClientOrNull,
    close,
  };
}

async function safeQuit(
  client: RedisClient | null,
  options: {
    logWarn: (obj: Record<string, unknown>, msg: string) => void;
    name: string;
    kind: string;
  },
): Promise<void> {
  if (!client) {
    return;
  }

  const isOpen = (client as unknown as { isOpen?: unknown }).isOpen;
  if (typeof isOpen === 'boolean' && !isOpen) {
    return;
  }

  try {
    await client.quit();
  } catch (err: unknown) {
    options.logWarn({ err, name: options.name, kind: options.kind }, 'redis.quit.failed');
    safeDisconnect(client);
  }
}

function safeDisconnect(client: unknown): void {
  const disconnect = (client as { disconnect?: unknown }).disconnect;
  if (typeof disconnect === 'function') {
    disconnect.call(client);
  }
}
