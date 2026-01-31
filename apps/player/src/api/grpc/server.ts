import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import {
  addGrpcService,
  createGrpcServerLifecycle,
  type GrpcServerLifecycle,
} from '@specify-poker/shared';
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

export type PlayerGrpcServer = GrpcServerLifecycle;

export function createGrpcServer(options: { port: number }): PlayerGrpcServer {
  return createGrpcServerLifecycle<PlayerProto>({
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
    port: options.port,
    loadProto: (loaded) => loaded as PlayerProto,
    register: (server, proto) => {
      addGrpcService({
        server,
        service: proto.player.PlayerService.service,
        handlers,
        serviceName: 'PlayerService',
      });

      addGrpcService({
        server,
        service: proto.grpc.health.v1.Health.service,
        handlers: createHealthHandlers(),
        serviceName: 'grpc.health.v1.Health',
      });
    },
    logger,
    logMessage: 'Player gRPC server listening',
  });
}
