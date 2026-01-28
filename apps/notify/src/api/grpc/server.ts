import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { createGrpcServerLifecycle } from "@specify-poker/shared";
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

type NotifyProto = {
  notify: { NotifyService: { service: grpc.ServiceDefinition } };
  grpc: { health: { v1: { Health: { service: grpc.ServiceDefinition } } } };
};

export function createGrpcServer(params: CreateGrpcServerParams): GrpcServer {
  const lifecycle = createGrpcServerLifecycle<NotifyProto>({
    grpc,
    protoLoader,
    protoPath: [PROTO_PATH, HEALTH_PROTO_PATH],
    protoLoaderOptions: {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    },
    port: params.port,
    loadProto: (loaded) => loaded as NotifyProto,
    register: (server, proto) => {
      const handlers = createHandlers(params.subscriptionService, params.pushService);
      const healthHandlers = createHealthHandlers();

      server.addService(proto.notify.NotifyService.service, handlers as unknown as grpc.UntypedServiceImplementation);
      server.addService(
        proto.grpc.health.v1.Health.service,
        healthHandlers as unknown as grpc.UntypedServiceImplementation,
      );
    },
    logger,
    logMessage: "Notify gRPC server listening",
  });

  return lifecycle;
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
