import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import {
  createGrpcServiceClientFactoryBuilder,
  type GrpcClientConstructor,
} from '@specify-poker/shared';

type UnaryCallback<TResponse> = (err: grpc.ServiceError | null, response: TResponse) => void;

export type BalanceReserveForBuyInResponse = {
  ok: boolean;
  reservation_id: string;
  error: string;
  available_balance: number;
};

export type BalanceCommitReservationResponse = {
  ok: boolean;
  transaction_id: string;
  error: string;
  new_balance: number;
};

export type BalanceServiceClient = {
  ReserveForBuyIn(
    request: {
      account_id: string;
      table_id: string;
      amount: number;
      idempotency_key: string;
      timeout_seconds?: number;
    },
    callback: UnaryCallback<BalanceReserveForBuyInResponse>,
  ): void;
  CommitReservation(
    request: { reservation_id: string },
    callback: UnaryCallback<BalanceCommitReservationResponse>,
  ): void;
};

type ChannelClientConstructor<TClient> = GrpcClientConstructor<TClient, grpc.ChannelCredentials>;

type BalanceProto = { balance: { BalanceService: ChannelClientConstructor<BalanceServiceClient> } };

const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
};

const grpcClientFactoryBuilder = createGrpcServiceClientFactoryBuilder<grpc.ChannelCredentials>({
  grpc,
  protoLoader,
  protoLoaderOptions: PROTO_LOADER_OPTIONS,
});

const protoPath = path.resolve(__dirname, '../../../..', 'balance/proto/balance.proto');
const balanceClientFactory = grpcClientFactoryBuilder.service<BalanceProto, BalanceServiceClient>({
  protoPath,
  getServiceConstructor: (proto) => proto.balance.BalanceService,
});

export function createBalanceClient(address = 'localhost:50051'): BalanceServiceClient {
  return balanceClientFactory.createClient({
    address,
    credentials: grpc.credentials.createInsecure(),
  });
}

export function grpcCall<TRequest, TResponse>(
  method: (
    request: TRequest,
    callback: (err: grpc.ServiceError | null, response: TResponse) => void,
  ) => void,
  request: TRequest,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    method(request, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}
