import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { handlers } from "./handlers";
import logger from "../../observability/logger";

const PROTO_PATH = path.resolve(__dirname, "../../../proto/balance.proto");

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
    balance: {
      BalanceService: {
        service: grpc.ServiceDefinition;
      };
    };
  };

  server = new grpc.Server();

  server.addService(proto.balance.BalanceService.service, {
    GetBalance: handlers.GetBalance,
    EnsureAccount: handlers.EnsureAccount,
    ReserveForBuyIn: handlers.ReserveForBuyIn,
    CommitReservation: handlers.CommitReservation,
    ReleaseReservation: handlers.ReleaseReservation,
    ProcessCashOut: handlers.ProcessCashOut,
    RecordContribution: handlers.RecordContribution,
    SettlePot: handlers.SettlePot,
    CancelPot: handlers.CancelPot,
  });

  return new Promise((resolve, reject) => {
    server!.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (error, boundPort) => {
        if (error) {
          reject(error);
          return;
        }
        logger.info({ port: boundPort }, "Balance gRPC server listening");
        resolve();
      }
    );
  });
}

export function stopGrpcServer(): void {
  if (server) {
    server.forceShutdown();
    server = null;
  }
}
