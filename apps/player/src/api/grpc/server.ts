import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { handlers } from "./handlers";
import { createHealthHandlers } from "./health";
import logger from "../../observability/logger";

const PROTO_PATH = path.resolve(__dirname, "../../../proto/player.proto");
const HEALTH_PROTO_PATH = path.resolve(__dirname, "../../../proto/health.proto");

let server: grpc.Server | null = null;

export async function startGrpcServer(port: number): Promise<void> {
  const packageDefinition = protoLoader.loadSync([PROTO_PATH, HEALTH_PROTO_PATH], {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: false,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as {
    player: {
      PlayerService: { service: grpc.ServiceDefinition };
    };
    grpc: {
      health: {
        v1: {
          Health: { service: grpc.ServiceDefinition };
        };
      };
    };
  };

  server = new grpc.Server();

  server.addService(proto.player.PlayerService.service, {
    GetProfile: handlers.GetProfile,
    GetProfiles: handlers.GetProfiles,
    UpdateProfile: handlers.UpdateProfile,
    DeleteProfile: handlers.DeleteProfile,
    GetStatistics: handlers.GetStatistics,
    IncrementStatistic: handlers.IncrementStatistic,
    GetFriends: handlers.GetFriends,
    AddFriend: handlers.AddFriend,
    RemoveFriend: handlers.RemoveFriend,
    GetNicknames: handlers.GetNicknames,
  });

  server.addService(proto.grpc.health.v1.Health.service, createHealthHandlers());

  return new Promise((resolve, reject) => {
    server!.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error, boundPort) => {
        if (error) {
          reject(error);
          return;
        }
        logger.info({ port: boundPort }, "Player gRPC server listening");
        resolve();
      }
    );
  });
}

export function stopGrpcServer(): void {
  if (server) {
    server.forceShutdown();
    server = null;
  }
}
