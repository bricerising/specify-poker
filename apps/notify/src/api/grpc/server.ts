import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { createHandlers } from "./handlers";
import { createHealthHandlers } from "./health";
import { SubscriptionService } from "../../services/subscriptionService";
import { PushSenderService } from "../../services/pushSenderService";
import logger from "../../observability/logger";

const PROTO_PATH = path.resolve(__dirname, "../../../proto/notify.proto");
const HEALTH_PROTO_PATH = path.resolve(__dirname, "../../../proto/health.proto");

export type GrpcServer = {
  start(): Promise<void>;
  stop(): void;
};

type CreateGrpcServerParams = {
  port: number;
  subscriptionService: SubscriptionService;
  pushService: PushSenderService;
};

export function createGrpcServer(params: CreateGrpcServerParams): GrpcServer {
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

  const server = new grpc.Server();

  const handlers = createHandlers(params.subscriptionService, params.pushService);
  const healthHandlers = createHealthHandlers();

  server.addService(
    proto.notify.NotifyService.service,
    handlers as unknown as grpc.UntypedServiceImplementation
  );
  server.addService(
    proto.grpc.health.v1.Health.service,
    healthHandlers as unknown as grpc.UntypedServiceImplementation
  );

  let isStarted = false;

  const start = async (): Promise<void> => {
    if (isStarted) {
      return;
    }

    return new Promise((resolve, reject) => {
      server.bindAsync(
        `0.0.0.0:${params.port}`,
        grpc.ServerCredentials.createInsecure(),
        (error, boundPort) => {
          if (error) {
            reject(error);
            return;
          }

          server.start();
          isStarted = true;
          logger.info({ port: boundPort }, "Notify gRPC server listening");
          resolve();
        }
      );
    });
  };

  const stop = (): void => {
    if (!isStarted) {
      return;
    }

    server.forceShutdown();
    isStarted = false;
  };

  return { start, stop };
}

let defaultServer: GrpcServer | null = null;

export async function startGrpcServer(
  port: number,
  subscriptionService: SubscriptionService,
  pushService: PushSenderService
): Promise<void> {
  if (defaultServer) {
    defaultServer.stop();
    defaultServer = null;
  }

  defaultServer = createGrpcServer({ port, subscriptionService, pushService });
  await defaultServer.start();
}

export function stopGrpcServer(): void {
  defaultServer?.stop();
  defaultServer = null;
}
