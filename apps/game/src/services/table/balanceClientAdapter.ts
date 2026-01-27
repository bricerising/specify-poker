import {
  balanceClient,
  BalanceCashOutResponse,
  BalanceCommitResponse,
  BalanceReservationResponse,
  BalanceSettleResponse,
} from "../../api/grpc/clients";
import { unaryCall } from "./grpcUnary";

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
      unaryCall<typeof request, BalanceReservation>(balanceClient.ReserveForBuyIn.bind(balanceClient), request),
    );
  }

  commitReservation(request: { reservation_id: string }) {
    return callWithAvailability(
      unaryCall<typeof request, BalanceCommit>(balanceClient.CommitReservation.bind(balanceClient), request),
    );
  }

  releaseReservation(request: { reservation_id: string; reason?: string }) {
    balanceClient.ReleaseReservation(request, () => undefined);
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
      unaryCall<typeof request, BalanceCashOut>(balanceClient.ProcessCashOut.bind(balanceClient), request),
    );
  }

  settlePot(request: {
    table_id: string;
    hand_id: string;
    winners: Array<{ seat_id: number; account_id: string; amount: number }>;
    idempotency_key: string;
  }) {
    return callWithAvailability(
      unaryCall<typeof request, BalanceSettle>(balanceClient.SettlePot.bind(balanceClient), request),
    );
  }
}

export const balanceClientAdapter = new BalanceClientAdapter();
