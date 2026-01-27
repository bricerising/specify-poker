import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { getConfig, type Config } from "../config";
import type { BalanceServiceClient, EventServiceClient, GameServiceClient, NotifyServiceClient, PlayerServiceClient } from "../types";

function loadProto(protoName: string) {
  const protoPath = path.resolve(__dirname, "../../proto", `${protoName}.proto`);
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

type GrpcClientConstructor<TClient> = new (address: string, credentials: grpc.ChannelCredentials) => TClient;

type GameProto = { game: { GameService: GrpcClientConstructor<GameServiceClient> } };
type PlayerProto = { player: { PlayerService: GrpcClientConstructor<PlayerServiceClient> } };
type BalanceProto = { balance: { BalanceService: GrpcClientConstructor<BalanceServiceClient> } };
type EventProto = { event: { EventService: GrpcClientConstructor<EventServiceClient> } };
type NotifyProto = { notify: { NotifyService: GrpcClientConstructor<NotifyServiceClient> } };

const gameProto = loadProto("game") as unknown as GameProto;
const playerProto = loadProto("player") as unknown as PlayerProto;
const balanceProto = loadProto("balance") as unknown as BalanceProto;
const eventProto = loadProto("event") as unknown as EventProto;
const notifyProto = loadProto("notify") as unknown as NotifyProto;

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
  return {
    gameClient: new gameProto.game.GameService(
      config.gameServiceUrl,
      grpc.credentials.createInsecure()
    ) as GameServiceClient,
    playerClient: new playerProto.player.PlayerService(
      config.playerServiceUrl,
      grpc.credentials.createInsecure()
    ) as PlayerServiceClient,
    balanceClient: new balanceProto.balance.BalanceService(
      config.balanceServiceUrl,
      grpc.credentials.createInsecure()
    ) as BalanceServiceClient,
    eventClient: new eventProto.event.EventService(
      config.eventServiceUrl,
      grpc.credentials.createInsecure()
    ) as EventServiceClient,
    notifyClient: new notifyProto.notify.NotifyService(
      config.notifyServiceUrl,
      grpc.credentials.createInsecure()
    ) as NotifyServiceClient,
  };
}

const config = getConfig();
export const { gameClient, playerClient, balanceClient, eventClient, notifyClient } = createGrpcClients(config);
