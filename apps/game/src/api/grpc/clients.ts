import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";

import { config } from "../../config";

const BALANCE_PROTO_PATH = path.resolve(__dirname, "../../../../balance/proto/balance.proto");
const EVENT_PROTO_PATH = path.resolve(__dirname, "../../../../event/proto/event.proto");

function loadProto(protoPath: string) {
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

type UnaryCallback<TResponse> = (err: grpc.ServiceError | null, response: TResponse) => void;

export interface BalanceServiceClient {
  ReserveForBuyIn(
    request: {
      account_id: string;
      table_id: string;
      amount: number;
      idempotency_key: string;
      timeout_seconds: number;
    },
    callback: UnaryCallback<unknown>,
  ): void;
  CommitReservation(
    request: { reservation_id: string },
    callback: UnaryCallback<unknown>,
  ): void;
  ReleaseReservation(
    request: { reservation_id: string; reason?: string },
    callback: UnaryCallback<unknown>,
  ): void;
  ProcessCashOut(
    request: {
      account_id: string;
      table_id: string;
      seat_id: number;
      amount: number;
      idempotency_key: string;
      hand_id?: string;
    },
    callback: UnaryCallback<unknown>,
  ): void;
  SettlePot(
    request: {
      table_id: string;
      hand_id: string;
      winners: Array<{ seat_id: number; account_id: string; amount: number }>;
      idempotency_key: string;
    },
    callback: UnaryCallback<unknown>,
  ): void;
}

export interface EventServiceClient {
  PublishEvent(
    request: {
      type: string;
      table_id: string;
      hand_id?: string;
      user_id?: string;
      seat_id?: number;
      payload: unknown;
      idempotency_key: string;
    },
    callback: UnaryCallback<unknown>,
  ): void;
}

type GrpcClientConstructor<TClient> = new (address: string, credentials: grpc.ChannelCredentials) => TClient;

type BalanceProto = { balance: { BalanceService: GrpcClientConstructor<BalanceServiceClient> } };
type EventProto = { event: { EventService: GrpcClientConstructor<EventServiceClient> } };

const balanceProto = loadProto(BALANCE_PROTO_PATH) as unknown as BalanceProto;
const eventProto = loadProto(EVENT_PROTO_PATH) as unknown as EventProto;

type GrpcClientsConfig = Pick<typeof config, "balanceServiceAddr" | "eventServiceAddr">;

export interface GrpcClients {
  balanceClient: BalanceServiceClient;
  eventClient: EventServiceClient;
}

export function createGrpcClients(configOverride: GrpcClientsConfig = config): GrpcClients {
  const credentials = grpc.credentials.createInsecure();
  return {
    balanceClient: new balanceProto.balance.BalanceService(
      configOverride.balanceServiceAddr,
      credentials,
    ),
    eventClient: new eventProto.event.EventService(
      configOverride.eventServiceAddr,
      credentials,
    ),
  };
}

export const { balanceClient, eventClient } = createGrpcClients();
