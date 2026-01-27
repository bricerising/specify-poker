import * as grpc from "@grpc/grpc-js";
import {
  asGrpcServiceError,
  createGrpcServiceError,
  createUnaryHandler,
  isGrpcServiceErrorLike,
  withUnaryErrorHandling,
  withUnaryTiming,
} from "@specify-poker/shared";
import {
  getBalance,
  ensureAccount,
  processCashOut,
} from "../../services/accountService";
import {
  reserveForBuyIn,
  commitReservation,
  releaseReservation,
} from "../../services/reservationService";
import {
  recordContribution,
  settlePot,
  cancelPot,
} from "../../services/tablePotService";
import { recordGrpcRequest } from "../../observability/metrics";
import logger from "../../observability/logger";
import { toNonEmptyString, toNumber } from "../validation";

class InvalidArgumentError extends Error {
  override name = "InvalidArgumentError";
}

function invalidArgument(message: string): never {
  throw new InvalidArgumentError(message);
}

function asServiceError(error: unknown): grpc.ServiceError {
  if (error instanceof InvalidArgumentError) {
    return createGrpcServiceError(grpc.status.INVALID_ARGUMENT, error.message, error) as grpc.ServiceError;
  }

  if (isGrpcServiceErrorLike(error)) {
    return asGrpcServiceError(error, { code: grpc.status.INTERNAL, message: "Unknown error" }) as grpc.ServiceError;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return createGrpcServiceError(grpc.status.INTERNAL, message, error) as grpc.ServiceError;
}

function createBalanceUnaryHandler<Req, Res>(
  method: string,
  handler: (request: Req) => Promise<Res> | Res
): grpc.handleUnaryCall<Req, Res> {
  return createUnaryHandler<Req, Res, grpc.ServerUnaryCall<Req, Res>, grpc.ServiceError>({
    handler: ({ request }) => handler(request),
    interceptors: [
      withUnaryTiming({ method, record: recordGrpcRequest }),
      withUnaryErrorHandling({
        method,
        logger,
        toServiceError: asServiceError,
        shouldLog: (error) => !(error instanceof InvalidArgumentError) && !isGrpcServiceErrorLike(error),
      }),
    ],
  });
}

// gRPC handler implementations
export const handlers = {
  GetBalance: createBalanceUnaryHandler("GetBalance", async ({ account_id }: { account_id: string }) => {
    const balance = await getBalance(account_id);
    if (!balance) {
      return {
        account_id,
        balance: 0,
        available_balance: 0,
        currency: "CHIPS",
        version: 0,
      };
    }
    return {
      account_id: balance.accountId,
      balance: balance.balance,
      available_balance: balance.availableBalance,
      currency: balance.currency,
      version: balance.version,
    };
  }),

  EnsureAccount: createBalanceUnaryHandler(
    "EnsureAccount",
    async ({ account_id, initial_balance }: { account_id: string; initial_balance?: number }) => {
      const accountId = toNonEmptyString(account_id);
      if (!accountId) {
        invalidArgument("account_id is required");
      }
      const initialBalance = toNumber(initial_balance ?? 0, 0);
      const result = await ensureAccount(accountId, initialBalance);
      return {
        account_id: result.account.accountId,
        balance: result.account.balance,
        created: result.created,
      };
    }
  ),

  ReserveForBuyIn: createBalanceUnaryHandler(
    "ReserveForBuyIn",
    async (request: {
      account_id: string;
      table_id: string;
      amount: number;
      idempotency_key: string;
      timeout_seconds?: number;
    }) => {
      const accountId = toNonEmptyString(request.account_id);
      const tableId = toNonEmptyString(request.table_id);
      const idempotencyKey = toNonEmptyString(request.idempotency_key);
      const amount = toNumber(request.amount, 0);
      const timeoutCandidate = toNumber(request.timeout_seconds, 0);
      const timeoutSeconds = timeoutCandidate > 0 ? timeoutCandidate : 30;
      if (!accountId || !tableId || !idempotencyKey || amount <= 0) {
        invalidArgument("invalid ReserveForBuyIn request");
      }

      const result = await reserveForBuyIn(
        accountId,
        tableId,
        amount,
        idempotencyKey,
        timeoutSeconds
      );

      return {
        ok: result.ok,
        reservation_id: result.ok ? result.reservationId : "",
        error: result.ok ? "" : result.error,
        available_balance: result.availableBalance ?? 0,
      };
    }
  ),

  CommitReservation: createBalanceUnaryHandler(
    "CommitReservation",
    async ({ reservation_id }: { reservation_id: string }) => {
      const reservationId = toNonEmptyString(reservation_id);
      if (!reservationId) {
        invalidArgument("reservation_id is required");
      }
      const result = await commitReservation(reservationId);
      return {
        ok: result.ok,
        transaction_id: result.ok ? result.transactionId : "",
        error: result.ok ? "" : result.error,
        new_balance: result.ok ? (result.newBalance ?? 0) : 0,
      };
    }
  ),

  ReleaseReservation: createBalanceUnaryHandler(
    "ReleaseReservation",
    async ({ reservation_id, reason }: { reservation_id: string; reason?: string }) => {
      const reservationId = toNonEmptyString(reservation_id);
      if (!reservationId) {
        invalidArgument("reservation_id is required");
      }
      const result = await releaseReservation(reservationId, reason);
      return {
        ok: result.ok,
        error: result.ok ? "" : result.error,
        available_balance: result.ok ? (result.availableBalance ?? 0) : 0,
      };
    }
  ),

  ProcessCashOut: createBalanceUnaryHandler(
    "ProcessCashOut",
    async (request: {
      account_id: string;
      table_id: string;
      seat_id: number;
      amount: number;
      idempotency_key: string;
      hand_id?: string;
    }) => {
      const accountId = toNonEmptyString(request.account_id);
      const tableId = toNonEmptyString(request.table_id);
      const idempotencyKey = toNonEmptyString(request.idempotency_key);
      const seatId = toNumber(request.seat_id, -1);
      const amount = toNumber(request.amount, 0);
      const handId = toNonEmptyString(request.hand_id);
      if (!accountId || !tableId || !idempotencyKey || seatId < 0 || amount <= 0) {
        invalidArgument("invalid ProcessCashOut request");
      }

      const result = await processCashOut(
        accountId,
        tableId,
        seatId,
        amount,
        idempotencyKey,
        handId ?? undefined
      );

      return {
        ok: result.ok,
        transaction_id: result.ok ? result.transactionId : "",
        error: result.ok ? "" : result.error,
        new_balance: result.ok ? result.newBalance : 0,
      };
    }
  ),

  RecordContribution: createBalanceUnaryHandler(
    "RecordContribution",
    async (request: {
      table_id: string;
      hand_id: string;
      seat_id: number;
      account_id: string;
      amount: number;
      contribution_type: string;
      idempotency_key: string;
    }) => {
      const tableId = toNonEmptyString(request.table_id);
      const handId = toNonEmptyString(request.hand_id);
      const accountId = toNonEmptyString(request.account_id);
      const contributionType = toNonEmptyString(request.contribution_type);
      const idempotencyKey = toNonEmptyString(request.idempotency_key);
      const seatId = toNumber(request.seat_id, -1);
      const amount = toNumber(request.amount, 0);
      if (
        !tableId ||
        !handId ||
        !accountId ||
        !contributionType ||
        !idempotencyKey ||
        seatId < 0 ||
        amount <= 0
      ) {
        invalidArgument("invalid RecordContribution request");
      }

      const result = await recordContribution(
        tableId,
        handId,
        seatId,
        accountId,
        amount,
        contributionType,
        idempotencyKey
      );

      return {
        ok: result.ok,
        error: result.ok ? "" : result.error,
        total_pot: result.ok ? result.totalPot : 0,
        seat_contribution: result.ok ? result.seatContribution : 0,
      };
    }
  ),

  SettlePot: createBalanceUnaryHandler(
    "SettlePot",
    async ({
      table_id,
      hand_id,
      winners,
      idempotency_key,
    }: {
      table_id: string;
      hand_id: string;
      winners: Array<{ seat_id: number; account_id: string; amount: number }>;
      idempotency_key: string;
    }) => {
      const tableId = toNonEmptyString(table_id);
      const handId = toNonEmptyString(hand_id);
      const idempotencyKey = toNonEmptyString(idempotency_key);
      if (!tableId || !handId || !idempotencyKey) {
        invalidArgument("invalid SettlePot request");
      }

      const parsedWinners = winners.map((winner) => {
        const accountId = toNonEmptyString(winner.account_id);
        const seatId = toNumber(winner.seat_id, -1);
        const amount = toNumber(winner.amount, -1);
        if (!accountId || seatId < 0 || amount < 0) {
          invalidArgument("invalid SettlePot winner");
        }
        return { seatId, accountId, amount };
      });

      const result = await settlePot(
        tableId,
        handId,
        parsedWinners,
        idempotencyKey
      );

      return {
        ok: result.ok,
        error: result.ok ? "" : result.error,
        results:
          result.ok
            ? result.results.map((r) => ({
                account_id: r.accountId,
                transaction_id: r.transactionId,
                amount: r.amount,
                new_balance: r.newBalance,
              }))
            : [],
      };
    }
  ),

  CancelPot: createBalanceUnaryHandler(
    "CancelPot",
    async ({ table_id, hand_id, reason }: { table_id: string; hand_id: string; reason: string }) => {
      const tableId = toNonEmptyString(table_id);
      const handId = toNonEmptyString(hand_id);
      const cancelReason = toNonEmptyString(reason);
      if (!tableId || !handId || !cancelReason) {
        invalidArgument("invalid CancelPot request");
      }

      const result = await cancelPot(tableId, handId, cancelReason);
      return {
        ok: result.ok,
        error: result.error ?? "",
      };
    }
  ),
};
