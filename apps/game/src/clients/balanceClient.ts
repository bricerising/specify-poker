import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
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

const proto = grpc.loadPackageDefinition(packageDefinition) as any;

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
  return new Promise((resolve) => {
    client.ReserveForBuyIn(
      {
        account_id: accountId,
        table_id: tableId,
        amount,
        idempotency_key: idempotencyKey,
        timeout_seconds: 30,
      },
      (err: any, response: any) => {
        if (err) {
          logger.error({ err, accountId, tableId }, "Balance reserve failed");
          resolve({ ok: false, error: "INTERNAL_ERROR" });
          return;
        }
        resolve({
          ok: response.ok,
          reservationId: response.reservation_id,
          error: response.error,
          availableBalance: parseInt(response.available_balance, 10),
        });
      }
    );
  });
}

export async function commitReservation(reservationId: string): Promise<CommitResult> {
  return new Promise((resolve) => {
    client.CommitReservation(
      { reservation_id: reservationId },
      (err: any, response: any) => {
        if (err) {
          logger.error({ err, reservationId }, "Balance commit failed");
          resolve({ ok: false, error: "INTERNAL_ERROR" });
          return;
        }
        resolve({
          ok: response.ok,
          transactionId: response.transaction_id,
          error: response.error,
          newBalance: parseInt(response.new_balance, 10),
        });
      }
    );
  });
}

export async function releaseReservation(
  reservationId: string,
  reason?: string
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    client.ReleaseReservation(
      { reservation_id: reservationId, reason },
      (err: any, response: any) => {
        if (err) {
          logger.error({ err, reservationId }, "Balance release failed");
          resolve({ ok: false, error: "INTERNAL_ERROR" });
          return;
        }
        resolve({ ok: response.ok, error: response.error });
      }
    );
  });
}

export async function processCashOut(
  accountId: string,
  tableId: string,
  seatId: number,
  amount: number,
  idempotencyKey: string,
  handId?: string
): Promise<CashOutResult> {
  return new Promise((resolve) => {
    client.ProcessCashOut(
      {
        account_id: accountId,
        table_id: tableId,
        seat_id: seatId,
        amount,
        idempotency_key: idempotencyKey,
        hand_id: handId,
      },
      (err: any, response: any) => {
        if (err) {
          logger.error({ err, accountId, tableId }, "Balance cash out failed");
          resolve({ ok: false, error: "INTERNAL_ERROR" });
          return;
        }
        resolve({
          ok: response.ok,
          transactionId: response.transaction_id,
          error: response.error,
          newBalance: parseInt(response.new_balance, 10),
        });
      }
    );
  });
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
  return new Promise((resolve) => {
    client.RecordContribution(
      {
        table_id: tableId,
        hand_id: handId,
        seat_id: seatId,
        account_id: accountId,
        amount,
        contribution_type: contributionType,
        idempotency_key: idempotencyKey,
      },
      (err: any, response: any) => {
        if (err) {
          logger.error({ err, tableId, handId }, "Balance contribution failed");
          resolve({ ok: false, error: "INTERNAL_ERROR" });
          return;
        }
        resolve({
          ok: response.ok,
          error: response.error,
          totalPot: parseInt(response.total_pot, 10),
          seatContribution: parseInt(response.seat_contribution, 10),
        });
      }
    );
  });
}

export async function settlePot(
  tableId: string,
  handId: string,
  winners: Array<{ seatId: number; accountId: string; amount: number }>,
  idempotencyKey: string
): Promise<SettlementResult> {
  return new Promise((resolve) => {
    client.SettlePot(
      {
        table_id: tableId,
        hand_id: handId,
        winners: winners.map((w) => ({
          seat_id: w.seatId,
          account_id: w.accountId,
          amount: w.amount,
        })),
        idempotency_key: idempotencyKey,
      },
      (err: any, response: any) => {
        if (err) {
          logger.error({ err, tableId, handId }, "Balance settle failed");
          resolve({ ok: false, error: "INTERNAL_ERROR" });
          return;
        }
        resolve({
          ok: response.ok,
          error: response.error,
          results: response.results?.map((r: any) => ({
            accountId: r.account_id,
            transactionId: r.transaction_id,
            amount: parseInt(r.amount, 10),
            newBalance: parseInt(r.new_balance, 10),
          })),
        });
      }
    );
  });
}

export async function cancelPot(
  tableId: string,
  handId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    client.CancelPot(
      { table_id: tableId, hand_id: handId, reason },
      (err: any, response: any) => {
        if (err) {
          logger.error({ err, tableId, handId }, "Balance cancel pot failed");
          resolve({ ok: false, error: "INTERNAL_ERROR" });
          return;
        }
        resolve({ ok: response.ok, error: response.error });
      }
    );
  });
}
