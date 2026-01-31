import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import {
  closeGrpcClient,
  createGrpcClientsFacade,
  createGrpcServiceClientFactoryBuilder,
  type GrpcClientConstructor,
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

type ChannelClientConstructor<TClient> = GrpcClientConstructor<TClient, grpc.ChannelCredentials>;

type GameProto = { game: { GameService: ChannelClientConstructor<GameServiceClient> } };
type PlayerProto = { player: { PlayerService: ChannelClientConstructor<PlayerServiceClient> } };
type BalanceProto = { balance: { BalanceService: ChannelClientConstructor<BalanceServiceClient> } };
type EventProto = { event: { EventService: ChannelClientConstructor<EventServiceClient> } };
type NotifyProto = { notify: { NotifyService: ChannelClientConstructor<NotifyServiceClient> } };

const grpcClientFactoryBuilder = createGrpcServiceClientFactoryBuilder<grpc.ChannelCredentials>({
  grpc,
  protoLoader,
  protoLoaderOptions: PROTO_LOADER_OPTIONS,
});

const gameClientFactory = grpcClientFactoryBuilder.service<GameProto, GameServiceClient>({
  protoPath: resolveProtoPath('game'),
  getServiceConstructor: (proto) => proto.game.GameService,
});
const playerClientFactory = grpcClientFactoryBuilder.service<PlayerProto, PlayerServiceClient>({
  protoPath: resolveProtoPath('player'),
  getServiceConstructor: (proto) => proto.player.PlayerService,
});
const balanceClientFactory = grpcClientFactoryBuilder.service<BalanceProto, BalanceServiceClient>({
  protoPath: resolveProtoPath('balance'),
  getServiceConstructor: (proto) => proto.balance.BalanceService,
});
const eventClientFactory = grpcClientFactoryBuilder.service<EventProto, EventServiceClient>({
  protoPath: resolveProtoPath('event'),
  getServiceConstructor: (proto) => proto.event.EventService,
});
const notifyClientFactory = grpcClientFactoryBuilder.service<NotifyProto, NotifyServiceClient>({
  protoPath: resolveProtoPath('notify'),
  getServiceConstructor: (proto) => proto.notify.NotifyService,
});

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

const defaultGrpcClients = createGrpcClientsFacade<Config, grpc.ChannelCredentials, GrpcClients>({
  getConfig,
  createCredentials: () => grpc.credentials.createInsecure(),
  disposeClient: closeGrpcClient,
  definitions: {
    gameClient: { factory: gameClientFactory, selectAddress: (config) => config.gameServiceUrl },
    playerClient: {
      factory: playerClientFactory,
      selectAddress: (config) => config.playerServiceUrl,
    },
    balanceClient: {
      factory: balanceClientFactory,
      selectAddress: (config) => config.balanceServiceUrl,
    },
    eventClient: { factory: eventClientFactory, selectAddress: (config) => config.eventServiceUrl },
    notifyClient: {
      factory: notifyClientFactory,
      selectAddress: (config) => config.notifyServiceUrl,
    },
  },
});

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
