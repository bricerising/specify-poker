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

const config = getConfig();
export const { gameClient, playerClient, balanceClient, eventClient, notifyClient } = createGrpcClients(config);
