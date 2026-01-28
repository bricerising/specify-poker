import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { createGrpcServerLifecycle, type GrpcServerLifecycle } from '@specify-poker/shared';
import { handlers } from './handlers';
import { createHealthHandlers } from './health';
import logger from '../../observability/logger';

const PROTO_PATH = path.resolve(__dirname, '../../../proto/player.proto');
const HEALTH_PROTO_PATH = path.resolve(__dirname, '../../../proto/health.proto');

type PlayerProto = {
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

let lifecycle: GrpcServerLifecycle | null = null;

export async function startGrpcServer(port: number): Promise<void> {
  lifecycle?.stop();
  lifecycle = createGrpcServerLifecycle<PlayerProto>({
    grpc,
    protoLoader,
    protoPath: [PROTO_PATH, HEALTH_PROTO_PATH],
    protoLoaderOptions: {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: false,
      oneofs: true,
    },
    port,
    loadProto: (loaded) => loaded as PlayerProto,
    register: (server, proto) => {
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
    },
    logger,
    logMessage: 'Player gRPC server listening',
  });

  await lifecycle.start();
}

export function stopGrpcServer(): void {
  lifecycle?.stop();
  lifecycle = null;
}
