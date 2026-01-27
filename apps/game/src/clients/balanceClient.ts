import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { unaryCallResult } from "@specify-poker/shared";
import { config } from "../config";
import logger from "../observability/logger";

const PROTO_PATH = path.resolve(__dirname, "../../proto/balance.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

type NumericString = string | number;

function parseNumeric(value: NumericString | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface ReserveForBuyInResponse {
  ok: boolean;
  reservation_id?: string;
  error?: string;
  available_balance?: NumericString;
}

interface CommitReservationResponse {
  ok: boolean;
  transaction_id?: string;
  error?: string;
  new_balance?: NumericString;
}

interface ReleaseReservationResponse {
  ok: boolean;
  error?: string;
}

interface ProcessCashOutResponse {
  ok: boolean;
  transaction_id?: string;
  error?: string;
  new_balance?: NumericString;
}

interface RecordContributionResponse {
  ok: boolean;
  error?: string;
  total_pot?: NumericString;
  seat_contribution?: NumericString;
}

interface SettlePotResult {
  account_id: string;
  transaction_id: string;
  amount: NumericString;
  new_balance: NumericString;
}

interface SettlePotResponse {
  ok: boolean;
  error?: string;
  results?: SettlePotResult[];
}

interface CancelPotResponse {
  ok: boolean;
  error?: string;
}

interface BalanceServiceClient {
  ReserveForBuyIn(
    request: {
      account_id: string;
      table_id: string;
      amount: number;
      idempotency_key: string;
      timeout_seconds: number;
    },
    callback: (err: grpc.ServiceError | null, response: ReserveForBuyInResponse) => void
  ): void;
  CommitReservation(
    request: { reservation_id: string },
    callback: (err: grpc.ServiceError | null, response: CommitReservationResponse) => void
  ): void;
  ReleaseReservation(
    request: { reservation_id: string; reason?: string },
    callback: (err: grpc.ServiceError | null, response: ReleaseReservationResponse) => void
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
    callback: (err: grpc.ServiceError | null, response: ProcessCashOutResponse) => void
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
    callback: (err: grpc.ServiceError | null, response: RecordContributionResponse) => void
  ): void;
  SettlePot(
    request: {
      table_id: string;
      hand_id: string;
      winners: Array<{ seat_id: number; account_id: string; amount: number }>;
      idempotency_key: string;
    },
    callback: (err: grpc.ServiceError | null, response: SettlePotResponse) => void
  ): void;
  CancelPot(
    request: { table_id: string; hand_id: string; reason: string },
    callback: (err: grpc.ServiceError | null, response: CancelPotResponse) => void
  ): void;
}

type BalanceProto = {
  balance: {
    BalanceService: new (addr: string, creds: grpc.ChannelCredentials) => BalanceServiceClient;
  };
};

const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as BalanceProto;

const client = new proto.balance.BalanceService(
  config.balanceServiceAddr,
  grpc.credentials.createInsecure()
);

export interface ReserveResult {
  ok: boolean;
  reservationId?: string;
  error?: string;
  availableBalance?: number;
}

export interface CommitResult {
  ok: boolean;
  transactionId?: string;
  error?: string;
  newBalance?: number;
}

export interface CashOutResult {
  ok: boolean;
  transactionId?: string;
  error?: string;
  newBalance?: number;
}

export interface ContributionResult {
  ok: boolean;
  error?: string;
  totalPot?: number;
  seatContribution?: number;
}

export interface SettlementResult {
  ok: boolean;
  error?: string;
  results?: Array<{
    accountId: string;
    transactionId: string;
    amount: number;
    newBalance: number;
  }>;
}

export async function reserveForBuyIn(
  accountId: string,
  tableId: string,
  amount: number,
  idempotencyKey: string
): Promise<ReserveResult> {
  const call = await unaryCallResult(client.ReserveForBuyIn.bind(client), {
    account_id: accountId,
    table_id: tableId,
    amount,
    idempotency_key: idempotencyKey,
    timeout_seconds: 30,
  });

  if (!call.ok) {
    logger.error({ err: call.error, accountId, tableId }, "Balance reserve failed");
    return { ok: false, error: "INTERNAL_ERROR" };
  }

  const response = call.value;
  return {
    ok: response.ok,
    reservationId: response.reservation_id,
    error: response.error,
    availableBalance: parseNumeric(response.available_balance),
  };
}

export async function commitReservation(reservationId: string): Promise<CommitResult> {
  const call = await unaryCallResult(client.CommitReservation.bind(client), {
    reservation_id: reservationId,
  });

  if (!call.ok) {
    logger.error({ err: call.error, reservationId }, "Balance commit failed");
    return { ok: false, error: "INTERNAL_ERROR" };
  }

  const response = call.value;
  return {
    ok: response.ok,
    transactionId: response.transaction_id,
    error: response.error,
    newBalance: parseNumeric(response.new_balance),
  };
}

export async function releaseReservation(
  reservationId: string,
  reason?: string
): Promise<{ ok: boolean; error?: string }> {
  const call = await unaryCallResult(client.ReleaseReservation.bind(client), {
    reservation_id: reservationId,
    reason,
  });

  if (!call.ok) {
    logger.error({ err: call.error, reservationId }, "Balance release failed");
    return { ok: false, error: "INTERNAL_ERROR" };
  }

  const response = call.value;
  return { ok: response.ok, error: response.error };
}

export async function processCashOut(
  accountId: string,
  tableId: string,
  seatId: number,
  amount: number,
  idempotencyKey: string,
  handId?: string
): Promise<CashOutResult> {
  const call = await unaryCallResult(client.ProcessCashOut.bind(client), {
    account_id: accountId,
    table_id: tableId,
    seat_id: seatId,
    amount,
    idempotency_key: idempotencyKey,
    hand_id: handId,
  });

  if (!call.ok) {
    logger.error({ err: call.error, accountId, tableId }, "Balance cash out failed");
    return { ok: false, error: "INTERNAL_ERROR" };
  }

  const response = call.value;
  return {
    ok: response.ok,
    transactionId: response.transaction_id,
    error: response.error,
    newBalance: parseNumeric(response.new_balance),
  };
}

export async function recordContribution(
  tableId: string,
  handId: string,
  seatId: number,
  accountId: string,
  amount: number,
  contributionType: string,
  idempotencyKey: string
): Promise<ContributionResult> {
  const call = await unaryCallResult(client.RecordContribution.bind(client), {
    table_id: tableId,
    hand_id: handId,
    seat_id: seatId,
    account_id: accountId,
    amount,
    contribution_type: contributionType,
    idempotency_key: idempotencyKey,
  });

  if (!call.ok) {
    logger.error({ err: call.error, tableId, handId }, "Balance contribution failed");
    return { ok: false, error: "INTERNAL_ERROR" };
  }

  const response = call.value;
  return {
    ok: response.ok,
    error: response.error,
    totalPot: parseNumeric(response.total_pot),
    seatContribution: parseNumeric(response.seat_contribution),
  };
}

export async function settlePot(
  tableId: string,
  handId: string,
  winners: Array<{ seatId: number; accountId: string; amount: number }>,
  idempotencyKey: string
): Promise<SettlementResult> {
  const call = await unaryCallResult(client.SettlePot.bind(client), {
    table_id: tableId,
    hand_id: handId,
    winners: winners.map((w) => ({
      seat_id: w.seatId,
      account_id: w.accountId,
      amount: w.amount,
    })),
    idempotency_key: idempotencyKey,
  });

  if (!call.ok) {
    logger.error({ err: call.error, tableId, handId }, "Balance settle failed");
    return { ok: false, error: "INTERNAL_ERROR" };
  }

  const response = call.value;
  return {
    ok: response.ok,
    error: response.error,
    results: response.results?.map((r) => ({
      accountId: r.account_id,
      transactionId: r.transaction_id,
      amount: parseNumeric(r.amount),
      newBalance: parseNumeric(r.new_balance),
    })),
  };
}

export async function cancelPot(
  tableId: string,
  handId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const call = await unaryCallResult(client.CancelPot.bind(client), {
    table_id: tableId,
    hand_id: handId,
    reason,
  });

  if (!call.ok) {
    logger.error({ err: call.error, tableId, handId }, "Balance cancel pot failed");
    return { ok: false, error: "INTERNAL_ERROR" };
  }

  const response = call.value;
  return { ok: response.ok, error: response.error };
}
