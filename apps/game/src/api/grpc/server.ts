import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import {
  addGrpcService,
  createGrpcServerLifecycle,
  type GrpcServerLifecycle,
} from '@specify-poker/shared';
import { createHandlers } from './handlers';
import logger from '../../observability/logger';

const PROTO_PATH = path.resolve(__dirname, '../../../proto/game.proto');

type GameProto = {
  game: { GameService: { service: grpc.ServiceDefinition } };
};

export type GameGrpcServer = GrpcServerLifecycle;

export function createGrpcServer(options: { port: number }): GameGrpcServer {
  return createGrpcServerLifecycle<GameProto>({
    grpc,
    protoLoader,
    protoPath: PROTO_PATH,
    protoLoaderOptions: {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    },
    port: options.port,
    loadProto: (loaded) => loaded as GameProto,
    register: (server, proto) => {
      const handlers = createHandlers();
      addGrpcService({
        server,
        service: proto.game.GameService.service,
        handlers,
        serviceName: 'GameService',
      });
    },
    logger,
    logMessage: 'Game gRPC server listening',
  });
}
