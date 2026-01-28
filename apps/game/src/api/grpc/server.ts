import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { createGrpcServerLifecycle, type GrpcServerLifecycle } from "@specify-poker/shared";
import { createHandlers } from "./handlers";
import logger from "../../observability/logger";

const PROTO_PATH = path.resolve(__dirname, "../../../proto/game.proto");

type GameProto = {
  game: { GameService: { service: grpc.ServiceDefinition } };
};

let lifecycle: GrpcServerLifecycle | null = null;

export async function startGrpcServer(port: number): Promise<void> {
  lifecycle?.stop();
  lifecycle = createGrpcServerLifecycle<GameProto>({
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
    port,
    loadProto: (loaded) => loaded as GameProto,
    register: (server, proto) => {
      const handlers = createHandlers();
      server.addService(proto.game.GameService.service, handlers as unknown as grpc.UntypedServiceImplementation);
    },
    logger,
    logMessage: "Game gRPC server listening",
  });

  await lifecycle.start();
}

export function stopGrpcServer(): void {
  lifecycle?.stop();
  lifecycle = null;
}
