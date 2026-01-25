import { balanceClient } from "../../api/grpc/clients";
import { unaryCall } from "./grpcUnary";

export type BalanceReservation = {
  ok: boolean;
  reservation_id?: string;
  error?: string;
  available_balance?: number;
};
export type BalanceCommit = { ok: boolean; error?: string; transaction_id?: string; new_balance?: number };
export type BalanceCashOut = { ok: boolean; error?: string; transaction_id?: string; new_balance?: number };
export type BalanceSettle = { ok: boolean; error?: string };

export class BalanceClientAdapter {
  reserveForBuyIn(request: {
    account_id: string;
    table_id: string;
    amount: number;
    idempotency_key: string;
    timeout_seconds: number;
  }) {
    return unaryCall<typeof request, BalanceReservation>(balanceClient.ReserveForBuyIn.bind(balanceClient), request);
  }

  commitReservation(request: { reservation_id: string }) {
    return unaryCall<typeof request, BalanceCommit>(balanceClient.CommitReservation.bind(balanceClient), request);
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
    return unaryCall<typeof request, BalanceCashOut>(balanceClient.ProcessCashOut.bind(balanceClient), request);
  }

  settlePot(request: {
    table_id: string;
    hand_id: string;
    winners: Array<{ seat_id: number; account_id: string; amount: number }>;
    idempotency_key: string;
  }) {
    return unaryCall<typeof request, BalanceSettle>(balanceClient.SettlePot.bind(balanceClient), request);
  }
}

export const balanceClientAdapter = new BalanceClientAdapter();

