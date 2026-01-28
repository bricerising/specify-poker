import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { createGrpcServiceClientFactory } from "@specify-poker/shared";
import { getConfig, type Config } from "../config";
import type { BalanceServiceClient, EventServiceClient, GameServiceClient, NotifyServiceClient, PlayerServiceClient } from "../types";

type ProtoName = "balance" | "event" | "game" | "notify" | "player";

const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const PROTO_DIR = path.resolve(__dirname, "../../proto");

function resolveProtoPath(protoName: ProtoName): string {
  return path.resolve(PROTO_DIR, `${protoName}.proto`);
}

type GrpcClientConstructor<TClient> = new (address: string, credentials: grpc.ChannelCredentials) => TClient;

type GameProto = { game: { GameService: GrpcClientConstructor<GameServiceClient> } };
type PlayerProto = { player: { PlayerService: GrpcClientConstructor<PlayerServiceClient> } };
type BalanceProto = { balance: { BalanceService: GrpcClientConstructor<BalanceServiceClient> } };
type EventProto = { event: { EventService: GrpcClientConstructor<EventServiceClient> } };
type NotifyProto = { notify: { NotifyService: GrpcClientConstructor<NotifyServiceClient> } };

const gameClientFactory = createGrpcServiceClientFactory<GameProto, GameServiceClient, grpc.ChannelCredentials>({
  grpc,
  protoLoader,
  protoPath: resolveProtoPath("game"),
  protoLoaderOptions: PROTO_LOADER_OPTIONS,
  getServiceConstructor: (proto) => proto.game.GameService,
});

const playerClientFactory = createGrpcServiceClientFactory<PlayerProto, PlayerServiceClient, grpc.ChannelCredentials>({
  grpc,
  protoLoader,
  protoPath: resolveProtoPath("player"),
  protoLoaderOptions: PROTO_LOADER_OPTIONS,
  getServiceConstructor: (proto) => proto.player.PlayerService,
});

const balanceClientFactory = createGrpcServiceClientFactory<BalanceProto, BalanceServiceClient, grpc.ChannelCredentials>({
  grpc,
  protoLoader,
  protoPath: resolveProtoPath("balance"),
  protoLoaderOptions: PROTO_LOADER_OPTIONS,
  getServiceConstructor: (proto) => proto.balance.BalanceService,
});

const eventClientFactory = createGrpcServiceClientFactory<EventProto, EventServiceClient, grpc.ChannelCredentials>({
  grpc,
  protoLoader,
  protoPath: resolveProtoPath("event"),
  protoLoaderOptions: PROTO_LOADER_OPTIONS,
  getServiceConstructor: (proto) => proto.event.EventService,
});

const notifyClientFactory = createGrpcServiceClientFactory<NotifyProto, NotifyServiceClient, grpc.ChannelCredentials>({
  grpc,
  protoLoader,
  protoPath: resolveProtoPath("notify"),
  protoLoaderOptions: PROTO_LOADER_OPTIONS,
  getServiceConstructor: (proto) => proto.notify.NotifyService,
});

type GrpcClientsConfig = Pick<
  Config,
  "gameServiceUrl" | "playerServiceUrl" | "balanceServiceUrl" | "eventServiceUrl" | "notifyServiceUrl"
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
    playerClient: playerClientFactory.createClient({ address: config.playerServiceUrl, credentials }),
    balanceClient: balanceClientFactory.createClient({ address: config.balanceServiceUrl, credentials }),
    eventClient: eventClientFactory.createClient({ address: config.eventServiceUrl, credentials }),
    notifyClient: notifyClientFactory.createClient({ address: config.notifyServiceUrl, credentials }),
  };
}

function createLazyGrpcClient<TClient extends object>(getClient: () => TClient): TClient {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "symbol") {
          return undefined;
        }

        if (prop === "then") {
          return undefined;
        }

        const client = getClient() as Record<string, unknown>;
        const value = client[prop];

        if (typeof value === "function") {
          return (value as (...args: unknown[]) => unknown).bind(client);
        }

        return value;
      },
    },
  ) as unknown as TClient;
}

let credentials: grpc.ChannelCredentials | null = null;

function getCredentials(): grpc.ChannelCredentials {
  if (!credentials) {
    credentials = grpc.credentials.createInsecure();
  }
  return credentials;
}

let cachedGameClient: GameServiceClient | null = null;
let cachedPlayerClient: PlayerServiceClient | null = null;
let cachedBalanceClient: BalanceServiceClient | null = null;
let cachedEventClient: EventServiceClient | null = null;
let cachedNotifyClient: NotifyServiceClient | null = null;

function createDefaultGameClient(): GameServiceClient {
  const config = getConfig();
  return gameClientFactory.createClient({ address: config.gameServiceUrl, credentials: getCredentials() });
}

function createDefaultPlayerClient(): PlayerServiceClient {
  const config = getConfig();
  return playerClientFactory.createClient({ address: config.playerServiceUrl, credentials: getCredentials() });
}

function createDefaultBalanceClient(): BalanceServiceClient {
  const config = getConfig();
  return balanceClientFactory.createClient({ address: config.balanceServiceUrl, credentials: getCredentials() });
}

function createDefaultEventClient(): EventServiceClient {
  const config = getConfig();
  return eventClientFactory.createClient({ address: config.eventServiceUrl, credentials: getCredentials() });
}

function createDefaultNotifyClient(): NotifyServiceClient {
  const config = getConfig();
  return notifyClientFactory.createClient({ address: config.notifyServiceUrl, credentials: getCredentials() });
}

export const gameClient = createLazyGrpcClient(() => {
  if (!cachedGameClient) {
    cachedGameClient = createDefaultGameClient();
  }
  return cachedGameClient;
});

export const playerClient = createLazyGrpcClient(() => {
  if (!cachedPlayerClient) {
    cachedPlayerClient = createDefaultPlayerClient();
  }
  return cachedPlayerClient;
});

export const balanceClient = createLazyGrpcClient(() => {
  if (!cachedBalanceClient) {
    cachedBalanceClient = createDefaultBalanceClient();
  }
  return cachedBalanceClient;
});

export const eventClient = createLazyGrpcClient(() => {
  if (!cachedEventClient) {
    cachedEventClient = createDefaultEventClient();
  }
  return cachedEventClient;
});

export const notifyClient = createLazyGrpcClient(() => {
  if (!cachedNotifyClient) {
    cachedNotifyClient = createDefaultNotifyClient();
  }
  return cachedNotifyClient;
});

export function resetGrpcClientsForTests(): void {
  credentials = null;
  cachedGameClient = null;
  cachedPlayerClient = null;
  cachedBalanceClient = null;
  cachedEventClient = null;
  cachedNotifyClient = null;
}
