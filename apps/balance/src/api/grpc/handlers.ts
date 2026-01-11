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

// gRPC handler implementations
export const handlers = {
  async GetBalance(
    call: { request: { account_id: string } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    try {
      const { account_id } = call.request;
      const balance = await getBalance(account_id);

      if (!balance) {
        callback(null, {
          account_id,
          balance: 0,
          available_balance: 0,
          currency: "CHIPS",
          version: 0,
        });
        return;
      }

      callback(null, {
        account_id: balance.accountId,
        balance: balance.balance,
        available_balance: balance.availableBalance,
        currency: balance.currency,
        version: balance.version,
      });
    } catch (error) {
      callback(error as Error);
    }
  },

  async EnsureAccount(
    call: { request: { account_id: string; initial_balance?: number } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    try {
      const { account_id, initial_balance = 0 } = call.request;
      const result = await ensureAccount(account_id, initial_balance);

      callback(null, {
        account_id: result.account.accountId,
        balance: result.account.balance,
        created: result.created,
      });
    } catch (error) {
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
    try {
      const { account_id, table_id, amount, idempotency_key, timeout_seconds } =
        call.request;

      const result = await reserveForBuyIn(
        account_id,
        table_id,
        amount,
        idempotency_key,
        timeout_seconds
      );

      callback(null, {
        ok: result.ok,
        reservation_id: result.reservationId ?? "",
        error: result.error ?? "",
        available_balance: result.availableBalance ?? 0,
      });
    } catch (error) {
      callback(error as Error);
    }
  },

  async CommitReservation(
    call: { request: { reservation_id: string } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    try {
      const { reservation_id } = call.request;
      const result = await commitReservation(reservation_id);

      callback(null, {
        ok: result.ok,
        transaction_id: result.transactionId ?? "",
        error: result.error ?? "",
        new_balance: result.newBalance ?? 0,
      });
    } catch (error) {
      callback(error as Error);
    }
  },

  async ReleaseReservation(
    call: { request: { reservation_id: string; reason?: string } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    try {
      const { reservation_id, reason } = call.request;
      const result = await releaseReservation(reservation_id, reason);

      callback(null, {
        ok: result.ok,
        error: result.error ?? "",
        available_balance: result.availableBalance ?? 0,
      });
    } catch (error) {
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
    try {
      const { account_id, table_id, seat_id, amount, idempotency_key, hand_id } =
        call.request;

      const result = await processCashOut(
        account_id,
        table_id,
        seat_id,
        amount,
        idempotency_key,
        hand_id
      );

      callback(null, {
        ok: result.ok,
        transaction_id: result.transactionId ?? "",
        error: result.error ?? "",
        new_balance: result.newBalance ?? 0,
      });
    } catch (error) {
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

      callback(null, {
        ok: result.ok,
        error: result.error ?? "",
        total_pot: result.totalPot ?? 0,
        seat_contribution: result.seatContribution ?? 0,
      });
    } catch (error) {
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
      callback(error as Error);
    }
  },

  async CancelPot(
    call: { request: { table_id: string; hand_id: string; reason: string } },
    callback: (error: Error | null, response?: unknown) => void
  ) {
    try {
      const { table_id, hand_id, reason } = call.request;
      const result = await cancelPot(table_id, hand_id, reason);

      callback(null, {
        ok: result.ok,
        error: result.error ?? "",
      });
    } catch (error) {
      callback(error as Error);
    }
  },
};
