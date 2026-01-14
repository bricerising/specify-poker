import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { createHandlers } from "./handlers";
import { createHealthHandlers } from "./health";
import { SubscriptionService } from "../../services/subscriptionService";
import { PushSenderService } from "../../services/pushSenderService";
import logger from "../../observability/logger";

const PROTO_PATH = path.resolve(__dirname, '../../../proto/notify.proto');
const HEALTH_PROTO_PATH = path.resolve(__dirname, "../../../proto/health.proto");

let server: grpc.Server | null = null;

export async function startGrpcServer(
  port: number,
  subscriptionService: SubscriptionService,
  pushService: PushSenderService
): Promise<void> {
  const packageDefinition = protoLoader.loadSync([PROTO_PATH, HEALTH_PROTO_PATH], {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as {
    notify: { NotifyService: { service: grpc.ServiceDefinition } };
    grpc: { health: { v1: { Health: { service: grpc.ServiceDefinition } } } };
  };

  server = new grpc.Server();

  const handlers = createHandlers(subscriptionService, pushService);
  const healthHandlers = createHealthHandlers();

  server.addService(proto.notify.NotifyService.service, handlers as unknown as grpc.UntypedServiceImplementation);
  server.addService(proto.grpc.health.v1.Health.service, healthHandlers as unknown as grpc.UntypedServiceImplementation);

  return new Promise((resolve, reject) => {
    server!.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) {
        reject(error);
        return;
      }
      logger.info({ port: boundPort }, "Notify gRPC server listening");
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
