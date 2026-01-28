import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { createGrpcServerLifecycle, type GrpcServerLifecycle } from '@specify-poker/shared';
import { handlers } from './handlers';
import logger from '../../observability/logger';

const PROTO_PATH = path.resolve(__dirname, '../../../proto/balance.proto');

type BalanceProto = {
  balance: {
    BalanceService: {
      service: grpc.ServiceDefinition;
    };
  };
};

let lifecycle: GrpcServerLifecycle | null = null;

export async function startGrpcServer(port: number): Promise<void> {
  lifecycle?.stop();
  lifecycle = createGrpcServerLifecycle<BalanceProto>({
    grpc,
    protoLoader,
    protoPath: PROTO_PATH,
    protoLoaderOptions: {
      keepCase: true,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    },
    port,
    loadProto: (loaded) => loaded as BalanceProto,
    register: (server, proto) => {
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
    },
    logger,
    logMessage: 'Balance gRPC server listening',
  });

  await lifecycle.start();
}

export function stopGrpcServer(): void {
  lifecycle?.stop();
  lifecycle = null;
}
