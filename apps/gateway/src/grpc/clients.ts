import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { createBoundTargetProxy, createGrpcServiceClientFactory } from '@specify-poker/shared';
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

let credentials: grpc.ChannelCredentials | null = null;

function getCredentials(): grpc.ChannelCredentials {
  if (!credentials) {
    credentials = grpc.credentials.createInsecure();
  }
  return credentials;
}

type ClientCache<TClient> = {
  get(): TClient;
  reset(): void;
};

function createClientCache<TClient>(createClient: () => TClient): ClientCache<TClient> {
  let client: TClient | null = null;

  return {
    get: () => {
      if (client) {
        return client;
      }
      client = createClient();
      return client;
    },
    reset: () => {
      client = null;
    },
  };
}

function createDefaultGameClient(): GameServiceClient {
  const config = getConfig();
  return gameClientFactory.createClient({
    address: config.gameServiceUrl,
    credentials: getCredentials(),
  });
}

function createDefaultPlayerClient(): PlayerServiceClient {
  const config = getConfig();
  return playerClientFactory.createClient({
    address: config.playerServiceUrl,
    credentials: getCredentials(),
  });
}

function createDefaultBalanceClient(): BalanceServiceClient {
  const config = getConfig();
  return balanceClientFactory.createClient({
    address: config.balanceServiceUrl,
    credentials: getCredentials(),
  });
}

function createDefaultEventClient(): EventServiceClient {
  const config = getConfig();
  return eventClientFactory.createClient({
    address: config.eventServiceUrl,
    credentials: getCredentials(),
  });
}

function createDefaultNotifyClient(): NotifyServiceClient {
  const config = getConfig();
  return notifyClientFactory.createClient({
    address: config.notifyServiceUrl,
    credentials: getCredentials(),
  });
}

const gameClientCache = createClientCache(createDefaultGameClient);
const playerClientCache = createClientCache(createDefaultPlayerClient);
const balanceClientCache = createClientCache(createDefaultBalanceClient);
const eventClientCache = createClientCache(createDefaultEventClient);
const notifyClientCache = createClientCache(createDefaultNotifyClient);

export const gameClient = createBoundTargetProxy(gameClientCache.get);
export const playerClient = createBoundTargetProxy(playerClientCache.get);
export const balanceClient = createBoundTargetProxy(balanceClientCache.get);
export const eventClient = createBoundTargetProxy(eventClientCache.get);
export const notifyClient = createBoundTargetProxy(notifyClientCache.get);

export function resetGrpcClientsForTests(): void {
  credentials = null;
  gameClientCache.reset();
  playerClientCache.reset();
  balanceClientCache.reset();
  eventClientCache.reset();
  notifyClientCache.reset();
}
