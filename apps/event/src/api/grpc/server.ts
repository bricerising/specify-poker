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

const PROTO_PATH = path.resolve(__dirname, '../../../proto/event.proto');

type EventProto = {
  event: { EventService: { service: grpc.ServiceDefinition } };
};

export type EventGrpcServer = GrpcServerLifecycle;

export function createGrpcServer(options: { port: number }): EventGrpcServer {
  return createGrpcServerLifecycle<EventProto>({
    grpc,
    protoLoader,
    protoPath: PROTO_PATH,
    protoLoaderOptions: {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    },
    port: options.port,
    loadProto: (loaded) => loaded as EventProto,
    register: (server, proto) => {
      addGrpcService({
        server,
        service: proto.event.EventService.service,
        handlers: createHandlers(),
        serviceName: 'EventService',
      });
    },
    logger,
    logMessage: 'Event gRPC server listening',
  });
}
