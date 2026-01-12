import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { getConfig } from "../config";
import { GameServiceClient, PlayerServiceClient, BalanceServiceClient, EventServiceClient } from "../types";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gameProto = loadProto("game") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const playerProto = loadProto("player") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const balanceProto = loadProto("balance") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventProto = loadProto("event") as any;

const config = getConfig();

export const gameClient = new gameProto.game.GameService(
  config.gameServiceUrl,
  grpc.credentials.createInsecure()
) as GameServiceClient;

export const playerClient = new playerProto.player.PlayerService(
  config.playerServiceUrl,
  grpc.credentials.createInsecure()
) as PlayerServiceClient;

export const balanceClient = new balanceProto.balance.BalanceService(
  config.balanceServiceUrl,
  grpc.credentials.createInsecure()
) as BalanceServiceClient;

export const eventClient = new eventProto.event.EventService(
  config.eventServiceUrl,
  grpc.credentials.createInsecure()
) as EventServiceClient;
