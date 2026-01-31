import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import {
  closeGrpcClient,
  createGrpcClientsFacade,
  createGrpcServiceClientFactory,
} from '@specify-poker/shared';

import { config } from '../../config';

const BALANCE_PROTO_PATH = path.resolve(__dirname, '../../../../balance/proto/balance.proto');
const EVENT_PROTO_PATH = path.resolve(__dirname, '../../../../event/proto/event.proto');

type NumericString = number | string;

const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

type UnaryCallback<TResponse> = (err: grpc.ServiceError | null, response: TResponse) => void;

// ============================================================================
// Response Types
// ============================================================================

export interface BalanceReservationResponse {
  ok: boolean;
  reservation_id?: string;
  error?: string;
  available_balance?: NumericString;
}

export interface BalanceCommitResponse {
  ok: boolean;
  error?: string;
  transaction_id?: string;
  new_balance?: NumericString;
}

export interface BalanceReleaseResponse {
  ok: boolean;
  error?: string;
  available_balance?: NumericString;
}

export interface BalanceCashOutResponse {
  ok: boolean;
  error?: string;
  transaction_id?: string;
  new_balance?: NumericString;
}

export interface BalanceRecordContributionResponse {
  ok: boolean;
  error?: string;
  total_pot?: NumericString;
  seat_contribution?: NumericString;
}

export interface BalanceSettlementResult {
  account_id: string;
  transaction_id: string;
  amount: NumericString;
  new_balance: NumericString;
}

export interface BalanceSettleResponse {
  ok: boolean;
  error?: string;
  results?: BalanceSettlementResult[];
}

export interface BalanceCancelPotResponse {
  ok: boolean;
  error?: string;
}

export interface EventPublishResponse {
  success: boolean;
  event_id?: string;
}

export interface EventPublishEventsResponse {
  success: boolean;
  event_ids?: string[];
}

// ============================================================================
// Client Interfaces
// ============================================================================

export interface BalanceServiceClient {
  ReserveForBuyIn(
    request: {
      account_id: string;
      table_id: string;
      amount: number;
      idempotency_key: string;
      timeout_seconds: number;
    },
    callback: UnaryCallback<BalanceReservationResponse>,
  ): void;
  CommitReservation(
    request: { reservation_id: string },
    callback: UnaryCallback<BalanceCommitResponse>,
  ): void;
  ReleaseReservation(
    request: { reservation_id: string; reason?: string },
    callback: UnaryCallback<BalanceReleaseResponse>,
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
    callback: UnaryCallback<BalanceCashOutResponse>,
  ): void;
  RecordContribution(
    request: {
      table_id: string;
      hand_id: string;
      seat_id: number;
      account_id: string;
      amount: number;
      contribution_type: string;
      idempotency_key: string;
    },
    callback: UnaryCallback<BalanceRecordContributionResponse>,
  ): void;
  SettlePot(
    request: {
      table_id: string;
      hand_id: string;
      winners: Array<{ seat_id: number; account_id: string; amount: number }>;
      idempotency_key: string;
    },
    callback: UnaryCallback<BalanceSettleResponse>,
  ): void;
  CancelPot(
    request: { table_id: string; hand_id: string; reason: string },
    callback: UnaryCallback<BalanceCancelPotResponse>,
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
    callback: UnaryCallback<EventPublishResponse>,
  ): void;
  PublishEvents(
    request: {
      events: Array<{
        type: string;
        table_id: string;
        hand_id?: string;
        user_id?: string;
        seat_id?: number;
        payload: unknown;
        idempotency_key: string;
      }>;
    },
    callback: UnaryCallback<EventPublishEventsResponse>,
  ): void;
}

type GrpcClientConstructor<TClient> = new (
  address: string,
  credentials: grpc.ChannelCredentials,
) => TClient;

type BalanceProto = { balance: { BalanceService: GrpcClientConstructor<BalanceServiceClient> } };
type EventProto = { event: { EventService: GrpcClientConstructor<EventServiceClient> } };

type GrpcClientsConfig = Pick<typeof config, 'balanceServiceAddr' | 'eventServiceAddr'>;

export interface GrpcClients {
  balanceClient: BalanceServiceClient;
  eventClient: EventServiceClient;
}

const balanceClientFactory = createGrpcServiceClientFactory<
  BalanceProto,
  BalanceServiceClient,
  grpc.ChannelCredentials
>({
  grpc,
  protoLoader,
  protoPath: BALANCE_PROTO_PATH,
  protoLoaderOptions: PROTO_LOADER_OPTIONS,
  getServiceConstructor: (proto) => proto.balance.BalanceService,
});

const eventClientFactory = createGrpcServiceClientFactory<
  EventProto,
  EventServiceClient,
  grpc.ChannelCredentials
>({
  grpc,
  protoLoader,
  protoPath: EVENT_PROTO_PATH,
  protoLoaderOptions: PROTO_LOADER_OPTIONS,
  getServiceConstructor: (proto) => proto.event.EventService,
});

type CreateGrpcServiceClientOptions = {
  address: string;
  credentials?: grpc.ChannelCredentials;
};

export function createBalanceClient(options: CreateGrpcServiceClientOptions): BalanceServiceClient {
  const credentials = options.credentials ?? grpc.credentials.createInsecure();
  return balanceClientFactory.createClient({ address: options.address, credentials });
}

export function createEventClient(options: CreateGrpcServiceClientOptions): EventServiceClient {
  const credentials = options.credentials ?? grpc.credentials.createInsecure();
  return eventClientFactory.createClient({ address: options.address, credentials });
}

export function createGrpcClients(configOverride: GrpcClientsConfig = config): GrpcClients {
  const credentials = grpc.credentials.createInsecure();
  return {
    balanceClient: createBalanceClient({ address: configOverride.balanceServiceAddr, credentials }),
    eventClient: createEventClient({ address: configOverride.eventServiceAddr, credentials }),
  };
}

const defaultGrpcClients = createGrpcClientsFacade<
  GrpcClientsConfig,
  grpc.ChannelCredentials,
  GrpcClients
>({
  getConfig: () => config,
  createCredentials: () => grpc.credentials.createInsecure(),
  disposeClient: closeGrpcClient,
  definitions: {
    balanceClient: {
      factory: balanceClientFactory,
      selectAddress: (currentConfig) => currentConfig.balanceServiceAddr,
    },
    eventClient: {
      factory: eventClientFactory,
      selectAddress: (currentConfig) => currentConfig.eventServiceAddr,
    },
  },
});

export function getBalanceClient(): BalanceServiceClient {
  return defaultGrpcClients.getClient('balanceClient');
}

export function getEventClient(): EventServiceClient {
  return defaultGrpcClients.getClient('eventClient');
}

export function resetGrpcClientsForTests(): void {
  defaultGrpcClients.resetForTests();
}

export function closeGrpcClients(): void {
  defaultGrpcClients.close();
}
