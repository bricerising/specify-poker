import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { createHandlers } from './handlers';
import { SubscriptionStore } from '../../storage/subscriptionStore';
import { PushService } from '../../services/pushService';

const PROTO_PATH = path.resolve(__dirname, '../../../proto/notify.proto');

let server: grpc.Server | null = null;

export async function startGrpcServer(
  port: number,
  subscriptionStore: SubscriptionStore,
  pushService: PushService
): Promise<void> {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDefinition) as any;

  server = new grpc.Server();

  const handlers = createHandlers(subscriptionStore, pushService);

  server.addService(proto.notify.NotifyService.service, handlers);

  return new Promise((resolve, reject) => {
    server!.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) {
        reject(error);
        return;
      }
      console.log(`Notify gRPC server listening on port ${boundPort}`);
      resolve();
    });
  });
}

export function stopGrpcServer(): void {
  if (server) {
    server.forceShutdown();
    server = null;
  }
}
