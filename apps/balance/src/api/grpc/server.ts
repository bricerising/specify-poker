import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import {
  addGrpcService,
  createGrpcServerLifecycle,
  type GrpcServerLifecycle,
} from '@specify-poker/shared';
import type { GrpcHandlers } from './handlers';
import logger from '../../observability/logger';

const PROTO_PATH = path.resolve(__dirname, '../../../proto/balance.proto');

type BalanceProto = {
  balance: {
    BalanceService: {
      service: grpc.ServiceDefinition;
    };
  };
};

export type BalanceGrpcServer = GrpcServerLifecycle;

export function createGrpcServer(options: {
  port: number;
  handlers: GrpcHandlers;
}): BalanceGrpcServer {
  return createGrpcServerLifecycle<BalanceProto>({
    grpc,
    protoLoader,
    protoPath: PROTO_PATH,
    protoLoaderOptions: {
      keepCase: true,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    },
    port: options.port,
    loadProto: (loaded) => loaded as BalanceProto,
    register: (server, proto) => {
      addGrpcService({
        server,
        service: proto.balance.BalanceService.service,
        handlers: options.handlers,
        serviceName: 'BalanceService',
      });
    },
    logger,
    logMessage: 'Balance gRPC server listening',
  });
}
