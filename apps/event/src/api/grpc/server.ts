import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { createHandlers } from "./handlers";
import logger from "../../observability/logger";

const PROTO_PATH = path.resolve(__dirname, "../../../proto/event.proto");

let server: grpc.Server | null = null;

export async function startGrpcServer(port: number): Promise<void> {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as {
    event: { EventService: { service: grpc.ServiceDefinition } };
  };

  const grpcServer = new grpc.Server();

  const handlers = createHandlers();

  grpcServer.addService(proto.event.EventService.service, {
    PublishEvent: handlers.publishEvent,
    PublishEvents: handlers.publishEvents,
    QueryEvents: handlers.queryEvents,
    GetEvent: handlers.getEvent,
    GetHandRecord: handlers.getHandRecord,
    GetHandHistory: handlers.getHandHistory,
    GetHandsForUser: handlers.getHandsForUser,
    GetHandReplay: handlers.getHandReplay,
    SubscribeToStream: handlers.subscribeToStream,
    GetCursor: handlers.getCursor,
    UpdateCursor: handlers.updateCursor,
  } as unknown as grpc.UntypedServiceImplementation);

  await new Promise<void>((resolve, reject) => {
    grpcServer.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) {
        reject(error);
        return;
      }
      grpcServer.start();
      logger.info({ port: boundPort }, "Event gRPC server listening");
      resolve();
    });
  });

  server = grpcServer;
}

export function stopGrpcServer(): void {
  if (server) {
    server.forceShutdown();
    server = null;
  }
}
