import { createLazyUnaryCallProxy } from "@specify-poker/shared";
import {
  BalanceCashOutResponse,
  BalanceCommitResponse,
  BalanceReservationResponse,
  BalanceSettleResponse,
  getBalanceClient,
} from "../../api/grpc/clients";

const unaryBalanceClient = createLazyUnaryCallProxy(getBalanceClient);

export type BalanceCall<TResponse> =
  | { type: "available"; response: TResponse }
  | { type: "unavailable"; error: unknown };

// Re-export response types for consumers
export type BalanceReservation = BalanceReservationResponse;
export type BalanceCommit = BalanceCommitResponse;
export type BalanceCashOut = BalanceCashOutResponse;
export type BalanceSettle = BalanceSettleResponse;

async function callWithAvailability<TResponse>(promise: Promise<TResponse>): Promise<BalanceCall<TResponse>> {
  try {
    const response = await promise;
    return { type: "available", response };
  } catch (error: unknown) {
    return { type: "unavailable", error };
  }
}

export class BalanceClientAdapter {
  reserveForBuyIn(request: {
    account_id: string;
    table_id: string;
    amount: number;
    idempotency_key: string;
    timeout_seconds: number;
  }) {
    return callWithAvailability(
      unaryBalanceClient.ReserveForBuyIn(request),
    );
  }

  commitReservation(request: { reservation_id: string }) {
    return callWithAvailability(
      unaryBalanceClient.CommitReservation(request),
    );
  }

  releaseReservation(request: { reservation_id: string; reason?: string }) {
    void unaryBalanceClient.ReleaseReservation(request).catch(() => undefined);
  }

  processCashOut(request: {
    account_id: string;
    table_id: string;
    seat_id: number;
    amount: number;
    idempotency_key: string;
    hand_id?: string;
  }) {
    return callWithAvailability(
      unaryBalanceClient.ProcessCashOut(request),
    );
  }

  settlePot(request: {
    table_id: string;
    hand_id: string;
    winners: Array<{ seat_id: number; account_id: string; amount: number }>;
    idempotency_key: string;
  }) {
    return callWithAvailability(
      unaryBalanceClient.SettlePot(request),
    );
  }
}

export const balanceClientAdapter = new BalanceClientAdapter();
