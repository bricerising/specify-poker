import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { createHandlers } from "./handlers";
import logger from "../../observability/logger";

const PROTO_PATH = path.resolve(__dirname, "../../../proto/game.proto");

let server: grpc.Server | null = null;

export async function startGrpcServer(port: number): Promise<void> {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as {
    game: { GameService: { service: grpc.ServiceDefinition } };
  };

  server = new grpc.Server();

  const handlers = createHandlers();

  server.addService(proto.game.GameService.service, handlers as unknown as grpc.UntypedServiceImplementation);

  return new Promise((resolve, reject) => {
    server!.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
      if (error) {
        reject(error);
        return;
      }
      logger.info({ port: boundPort }, "Game gRPC server listening");
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
