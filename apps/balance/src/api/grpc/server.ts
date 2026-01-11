import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { handlers } from "./handlers";

const PROTO_PATH = path.resolve(
  __dirname,
  "../../../../../specs/002-balance-service/balance.proto"
);

let server: grpc.Server | null = null;

export async function startGrpcServer(port: number): Promise<void> {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDefinition) as any;

  server = new grpc.Server();

  server.addService(proto.balance.BalanceService.service, {
    getBalance: handlers.GetBalance,
    ensureAccount: handlers.EnsureAccount,
    reserveForBuyIn: handlers.ReserveForBuyIn,
    commitReservation: handlers.CommitReservation,
    releaseReservation: handlers.ReleaseReservation,
    processCashOut: handlers.ProcessCashOut,
    recordContribution: handlers.RecordContribution,
    settlePot: handlers.SettlePot,
    cancelPot: handlers.CancelPot,
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
        console.log(`gRPC server listening on port ${boundPort}`);
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
