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

function recordDuration(method: string, startedAt: number, status: "ok" | "error") {
  recordGrpcRequest(method, status, Date.now() - startedAt);
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function invalidArgument(callback: (error: Error | null, response?: unknown) => void, message: string) {
  callback(new Error(message));
}

// gRPC handler implementations
export const handlers = {
  async GetBalance(
    call: { request: { account_id: string } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    const startedAt = Date.now();
    try {
      const { account_id } = call.request;
      const balance = await getBalance(account_id);

      if (!balance) {
        recordDuration("GetBalance", startedAt, "ok");
        callback(null, {
          account_id,
          balance: 0,
          available_balance: 0,
          currency: "CHIPS",
          version: 0,
        });
        return;
      }

      recordDuration("GetBalance", startedAt, "ok");
      callback(null, {
        account_id: balance.accountId,
        balance: balance.balance,
        available_balance: balance.availableBalance,
        currency: balance.currency,
        version: balance.version,
      });
    } catch (error) {
      recordDuration("GetBalance", startedAt, "error");
      logger.error({ err: error }, "GetBalance failed");
      callback(error as Error);
    }
  },

  async EnsureAccount(
    call: { request: { account_id: string; initial_balance?: number } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    const startedAt = Date.now();
    try {
      const accountId = toNonEmptyString(call.request.account_id);
      if (!accountId) {
        recordDuration("EnsureAccount", startedAt, "error");
        return invalidArgument(callback, "account_id is required");
      }
      const initialBalance = toNumber(call.request.initial_balance ?? 0, 0);
      const result = await ensureAccount(accountId, initialBalance);

      recordDuration("EnsureAccount", startedAt, "ok");
      callback(null, {
        account_id: result.account.accountId,
        balance: result.account.balance,
        created: result.created,
      });
    } catch (error) {
      recordDuration("EnsureAccount", startedAt, "error");
      logger.error({ err: error }, "EnsureAccount failed");
      callback(error as Error);
    }
  },

  async ReserveForBuyIn(
    call: {
      request: {
        account_id: string;
        table_id: string;
        amount: number;
        idempotency_key: string;
        timeout_seconds?: number;
      };
    },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    const startedAt = Date.now();
    try {
      const accountId = toNonEmptyString(call.request.account_id);
      const tableId = toNonEmptyString(call.request.table_id);
      const idempotencyKey = toNonEmptyString(call.request.idempotency_key);
      const amount = toNumber(call.request.amount, 0);
      const timeoutCandidate = toNumber(call.request.timeout_seconds, 0);
      const timeoutSeconds = timeoutCandidate > 0 ? timeoutCandidate : 30;
      if (!accountId || !tableId || !idempotencyKey || amount <= 0) {
        recordDuration("ReserveForBuyIn", startedAt, "error");
        return invalidArgument(callback, "invalid ReserveForBuyIn request");
      }

      const result = await reserveForBuyIn(
        accountId,
        tableId,
        amount,
        idempotencyKey,
        timeoutSeconds
      );

      recordDuration("ReserveForBuyIn", startedAt, "ok");
      callback(null, {
        ok: result.ok,
        reservation_id: result.reservationId ?? "",
        error: result.error ?? "",
        available_balance: result.availableBalance ?? 0,
      });
    } catch (error) {
      recordDuration("ReserveForBuyIn", startedAt, "error");
      logger.error({ err: error }, "ReserveForBuyIn failed");
      callback(error as Error);
    }
  },

  async CommitReservation(
    call: { request: { reservation_id: string } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    const startedAt = Date.now();
    try {
      const reservationId = toNonEmptyString(call.request.reservation_id);
      if (!reservationId) {
        recordDuration("CommitReservation", startedAt, "error");
        return invalidArgument(callback, "reservation_id is required");
      }
      const result = await commitReservation(reservationId);

      recordDuration("CommitReservation", startedAt, "ok");
      callback(null, {
        ok: result.ok,
        transaction_id: result.transactionId ?? "",
        error: result.error ?? "",
        new_balance: result.newBalance ?? 0,
      });
    } catch (error) {
      recordDuration("CommitReservation", startedAt, "error");
      logger.error({ err: error }, "CommitReservation failed");
      callback(error as Error);
    }
  },

  async ReleaseReservation(
    call: { request: { reservation_id: string; reason?: string } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    const startedAt = Date.now();
    try {
      const reservationId = toNonEmptyString(call.request.reservation_id);
      if (!reservationId) {
        recordDuration("ReleaseReservation", startedAt, "error");
        return invalidArgument(callback, "reservation_id is required");
      }
      const result = await releaseReservation(reservationId, call.request.reason);

      recordDuration("ReleaseReservation", startedAt, "ok");
      callback(null, {
        ok: result.ok,
        error: result.error ?? "",
        available_balance: result.availableBalance ?? 0,
      });
    } catch (error) {
      recordDuration("ReleaseReservation", startedAt, "error");
      logger.error({ err: error }, "ReleaseReservation failed");
      callback(error as Error);
    }
  },

  async ProcessCashOut(
    call: {
      request: {
        account_id: string;
        table_id: string;
        seat_id: number;
        amount: number;
        idempotency_key: string;
        hand_id?: string;
      };
    },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    const startedAt = Date.now();
    try {
      const accountId = toNonEmptyString(call.request.account_id);
      const tableId = toNonEmptyString(call.request.table_id);
      const idempotencyKey = toNonEmptyString(call.request.idempotency_key);
      const seatId = toNumber(call.request.seat_id, -1);
      const amount = toNumber(call.request.amount, 0);
      const handId = toNonEmptyString(call.request.hand_id);
      if (!accountId || !tableId || !idempotencyKey || seatId < 0 || amount <= 0) {
        recordDuration("ProcessCashOut", startedAt, "error");
        return invalidArgument(callback, "invalid ProcessCashOut request");
      }

      const result = await processCashOut(
        accountId,
        tableId,
        seatId,
        amount,
        idempotencyKey,
        handId ?? undefined
      );

      recordDuration("ProcessCashOut", startedAt, "ok");
      callback(null, {
        ok: result.ok,
        transaction_id: result.transactionId ?? "",
        error: result.error ?? "",
        new_balance: result.newBalance ?? 0,
      });
    } catch (error) {
      recordDuration("ProcessCashOut", startedAt, "error");
      logger.error({ err: error }, "ProcessCashOut failed");
      callback(error as Error);
    }
  },

  async RecordContribution(
    call: {
      request: {
        table_id: string;
        hand_id: string;
        seat_id: number;
        account_id: string;
        amount: number;
        contribution_type: string;
        idempotency_key: string;
      };
    },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    const startedAt = Date.now();
    try {
      const {
        table_id,
        hand_id,
        seat_id,
        account_id,
        amount,
        contribution_type,
        idempotency_key,
      } = call.request;

      const result = await recordContribution(
        table_id,
        hand_id,
        seat_id,
        account_id,
        amount,
        contribution_type,
        idempotency_key
      );

      recordDuration("RecordContribution", startedAt, "ok");
      callback(null, {
        ok: result.ok,
        error: result.error ?? "",
        total_pot: result.totalPot ?? 0,
        seat_contribution: result.seatContribution ?? 0,
      });
    } catch (error) {
      recordDuration("RecordContribution", startedAt, "error");
      logger.error({ err: error }, "RecordContribution failed");
      callback(error as Error);
    }
  },

  async SettlePot(
    call: {
      request: {
        table_id: string;
        hand_id: string;
        winners: Array<{ seat_id: number; account_id: string; amount: number }>;
        idempotency_key: string;
      };
    },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    const startedAt = Date.now();
    try {
      const { table_id, hand_id, winners, idempotency_key } = call.request;

      const result = await settlePot(
        table_id,
        hand_id,
        winners.map((w) => ({
          seatId: w.seat_id,
          accountId: w.account_id,
          amount: w.amount,
        })),
        idempotency_key
      );

      recordDuration("SettlePot", startedAt, "ok");
      callback(null, {
        ok: result.ok,
        error: result.error ?? "",
        results:
          result.results?.map((r) => ({
            account_id: r.accountId,
            transaction_id: r.transactionId,
            amount: r.amount,
            new_balance: r.newBalance,
          })) ?? [],
      });
    } catch (error) {
      recordDuration("SettlePot", startedAt, "error");
      logger.error({ err: error }, "SettlePot failed");
      callback(error as Error);
    }
  },

  async CancelPot(
    call: { request: { table_id: string; hand_id: string; reason: string } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    const startedAt = Date.now();
    try {
      const { table_id, hand_id, reason } = call.request;
      const result = await cancelPot(table_id, hand_id, reason);

      recordDuration("CancelPot", startedAt, "ok");
      callback(null, {
        ok: result.ok,
        error: result.error ?? "",
      });
    } catch (error) {
      recordDuration("CancelPot", startedAt, "error");
      logger.error({ err: error }, "CancelPot failed");
      callback(error as Error);
    }
  },
};
