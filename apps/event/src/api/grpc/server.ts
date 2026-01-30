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

let lifecycle: GrpcServerLifecycle | null = null;

export async function startGrpcServer(port: number): Promise<void> {
  lifecycle?.stop();
  lifecycle = createGrpcServerLifecycle<EventProto>({
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
    port,
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

  await lifecycle.start();
}

export function stopGrpcServer(): void {
  lifecycle?.stop();
  lifecycle = null;
}
