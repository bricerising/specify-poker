import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import {
  closeGrpcClient,
  createBoundTargetProxy,
  createDisposableLazyValue,
  createGrpcServiceClientFactory,
  createLazyValue,
} from '@specify-poker/shared';
import { getConfig, type Config } from '../config';
import type {
  BalanceServiceClient,
  EventServiceClient,
  GameServiceClient,
  NotifyServiceClient,
  PlayerServiceClient,
} from '../types';

type ProtoName = 'balance' | 'event' | 'game' | 'notify' | 'player';

const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const PROTO_DIR = path.resolve(__dirname, '../../proto');

function resolveProtoPath(protoName: ProtoName): string {
  return path.resolve(PROTO_DIR, `${protoName}.proto`);
}

type GrpcClientConstructor<TClient> = new (
  address: string,
  credentials: grpc.ChannelCredentials,
) => TClient;

type GameProto = { game: { GameService: GrpcClientConstructor<GameServiceClient> } };
type PlayerProto = { player: { PlayerService: GrpcClientConstructor<PlayerServiceClient> } };
type BalanceProto = { balance: { BalanceService: GrpcClientConstructor<BalanceServiceClient> } };
type EventProto = { event: { EventService: GrpcClientConstructor<EventServiceClient> } };
type NotifyProto = { notify: { NotifyService: GrpcClientConstructor<NotifyServiceClient> } };

function createClientFactory<TProto, TClient>(
  protoName: ProtoName,
  getServiceConstructor: (proto: TProto) => GrpcClientConstructor<TClient>,
) {
  return createGrpcServiceClientFactory<TProto, TClient, grpc.ChannelCredentials>({
    grpc,
    protoLoader,
    protoPath: resolveProtoPath(protoName),
    protoLoaderOptions: PROTO_LOADER_OPTIONS,
    getServiceConstructor,
  });
}

const gameClientFactory = createClientFactory<GameProto, GameServiceClient>(
  'game',
  (proto) => proto.game.GameService,
);
const playerClientFactory = createClientFactory<PlayerProto, PlayerServiceClient>(
  'player',
  (proto) => proto.player.PlayerService,
);
const balanceClientFactory = createClientFactory<BalanceProto, BalanceServiceClient>(
  'balance',
  (proto) => proto.balance.BalanceService,
);
const eventClientFactory = createClientFactory<EventProto, EventServiceClient>(
  'event',
  (proto) => proto.event.EventService,
);
const notifyClientFactory = createClientFactory<NotifyProto, NotifyServiceClient>(
  'notify',
  (proto) => proto.notify.NotifyService,
);

type GrpcClientsConfig = Pick<
  Config,
  | 'gameServiceUrl'
  | 'playerServiceUrl'
  | 'balanceServiceUrl'
  | 'eventServiceUrl'
  | 'notifyServiceUrl'
>;

export interface GrpcClients {
  gameClient: GameServiceClient;
  playerClient: PlayerServiceClient;
  balanceClient: BalanceServiceClient;
  eventClient: EventServiceClient;
  notifyClient: NotifyServiceClient;
}

export function createGrpcClients(config: GrpcClientsConfig): GrpcClients {
  const credentials = grpc.credentials.createInsecure();
  return {
    gameClient: gameClientFactory.createClient({ address: config.gameServiceUrl, credentials }),
    playerClient: playerClientFactory.createClient({
      address: config.playerServiceUrl,
      credentials,
    }),
    balanceClient: balanceClientFactory.createClient({
      address: config.balanceServiceUrl,
      credentials,
    }),
    eventClient: eventClientFactory.createClient({ address: config.eventServiceUrl, credentials }),
    notifyClient: notifyClientFactory.createClient({
      address: config.notifyServiceUrl,
      credentials,
    }),
  };
}

type ServiceClientFactory<TClient> = {
  createClient(options: { address: string; credentials: grpc.ChannelCredentials }): TClient;
};

type LazyGrpcClient<TClient extends object> = {
  get(): TClient;
  proxy: TClient;
  reset(): void;
  dispose(): void;
};

function createLazyGrpcClient<TClient extends object>(
  create: () => TClient,
): LazyGrpcClient<TClient> {
  const lazy = createDisposableLazyValue(create, closeGrpcClient);
  return {
    get: lazy.get,
    proxy: createBoundTargetProxy(lazy.get),
    reset: lazy.reset,
    dispose: lazy.dispose,
  };
}

type DefaultGrpcClientsFacade = {
  clients: GrpcClients;
  getClient<K extends keyof GrpcClients>(key: K): GrpcClients[K];
  close(): void;
  resetForTests(): void;
};

function createDefaultGrpcClientsFacade(): DefaultGrpcClientsFacade {
  const credentials = createLazyValue<grpc.ChannelCredentials>(() =>
    grpc.credentials.createInsecure(),
  );

  const createDefaultClient = <TClient>(
    factory: ServiceClientFactory<TClient>,
    selectAddress: (config: Config) => string,
  ): TClient => {
    const config = getConfig();
    return factory.createClient({ address: selectAddress(config), credentials: credentials.get() });
  };

  const lazyClients: { [K in keyof GrpcClients]: LazyGrpcClient<GrpcClients[K]> } = {
    gameClient: createLazyGrpcClient(() =>
      createDefaultClient(gameClientFactory, (config) => config.gameServiceUrl),
    ),
    playerClient: createLazyGrpcClient(() =>
      createDefaultClient(playerClientFactory, (config) => config.playerServiceUrl),
    ),
    balanceClient: createLazyGrpcClient(() =>
      createDefaultClient(balanceClientFactory, (config) => config.balanceServiceUrl),
    ),
    eventClient: createLazyGrpcClient(() =>
      createDefaultClient(eventClientFactory, (config) => config.eventServiceUrl),
    ),
    notifyClient: createLazyGrpcClient(() =>
      createDefaultClient(notifyClientFactory, (config) => config.notifyServiceUrl),
    ),
  };

  return {
    clients: {
      gameClient: lazyClients.gameClient.proxy,
      playerClient: lazyClients.playerClient.proxy,
      balanceClient: lazyClients.balanceClient.proxy,
      eventClient: lazyClients.eventClient.proxy,
      notifyClient: lazyClients.notifyClient.proxy,
    },
    getClient: (key) => lazyClients[key].get(),
    close: () => {
      for (const lazy of Object.values(lazyClients)) {
        lazy.dispose();
      }
    },
    resetForTests: () => {
      credentials.reset();
      for (const lazy of Object.values(lazyClients)) {
        lazy.reset();
      }
    },
  };
}

const defaultGrpcClients = createDefaultGrpcClientsFacade();

export const gameClient = defaultGrpcClients.clients.gameClient;
export const playerClient = defaultGrpcClients.clients.playerClient;
export const balanceClient = defaultGrpcClients.clients.balanceClient;
export const eventClient = defaultGrpcClients.clients.eventClient;
export const notifyClient = defaultGrpcClients.clients.notifyClient;

export function getGameClient(): GameServiceClient {
  return defaultGrpcClients.getClient('gameClient');
}

export function getPlayerClient(): PlayerServiceClient {
  return defaultGrpcClients.getClient('playerClient');
}

export function getBalanceClient(): BalanceServiceClient {
  return defaultGrpcClients.getClient('balanceClient');
}

export function getEventClient(): EventServiceClient {
  return defaultGrpcClients.getClient('eventClient');
}

export function getNotifyClient(): NotifyServiceClient {
  return defaultGrpcClients.getClient('notifyClient');
}

export function closeGrpcClients(): void {
  defaultGrpcClients.close();
}

export function resetGrpcClientsForTests(): void {
  defaultGrpcClients.resetForTests();
}
