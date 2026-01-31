import { createLazyUnaryCallResultProxy, mapResult, type Result } from '@specify-poker/shared';
import { getBalanceClient } from '../api/grpc/clients';

type NumericString = string | number;

function parseNumeric(value: NumericString | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

const unaryBalanceClient = createLazyUnaryCallResultProxy(getBalanceClient);

export type BalanceCall<TResponse> = Result<TResponse, unknown>;

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

export interface ReleaseResult {
  ok: boolean;
  error?: string;
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

export interface ReserveForBuyInParams {
  accountId: string;
  tableId: string;
  amount: number;
  idempotencyKey: string;
  timeoutSeconds?: number;
}

export interface CommitReservationParams {
  reservationId: string;
}

export interface ReleaseReservationParams {
  reservationId: string;
  reason?: string;
}

export interface ProcessCashOutParams {
  accountId: string;
  tableId: string;
  seatId: number;
  amount: number;
  idempotencyKey: string;
  handId?: string;
}

export interface RecordContributionParams {
  tableId: string;
  handId: string;
  seatId: number;
  accountId: string;
  amount: number;
  contributionType: string;
  idempotencyKey: string;
}

export interface SettlePotParams {
  tableId: string;
  handId: string;
  winners: Array<{ seatId: number; accountId: string; amount: number }>;
  idempotencyKey: string;
}

export interface CancelPotParams {
  tableId: string;
  handId: string;
  reason: string;
}

export async function reserveForBuyIn(
  params: ReserveForBuyInParams,
): Promise<BalanceCall<ReserveResult>> {
  const call = await unaryBalanceClient.ReserveForBuyIn({
    account_id: params.accountId,
    table_id: params.tableId,
    amount: params.amount,
    idempotency_key: params.idempotencyKey,
    timeout_seconds: params.timeoutSeconds ?? 30,
  });

  return mapResult(call, (response) => ({
    ok: response.ok,
    reservationId: response.reservation_id,
    error: response.error,
    availableBalance: parseNumeric(response.available_balance),
  }));
}

export async function commitReservation(
  params: CommitReservationParams,
): Promise<BalanceCall<CommitResult>> {
  const call = await unaryBalanceClient.CommitReservation({
    reservation_id: params.reservationId,
  });

  return mapResult(call, (response) => ({
    ok: response.ok,
    transactionId: response.transaction_id,
    error: response.error,
    newBalance: parseNumeric(response.new_balance),
  }));
}

export async function releaseReservation(
  params: ReleaseReservationParams,
): Promise<BalanceCall<ReleaseResult>> {
  const call = await unaryBalanceClient.ReleaseReservation({
    reservation_id: params.reservationId,
    reason: params.reason,
  });

  return mapResult(call, (response) => ({ ok: response.ok, error: response.error }));
}

export async function processCashOut(
  params: ProcessCashOutParams,
): Promise<BalanceCall<CashOutResult>> {
  const call = await unaryBalanceClient.ProcessCashOut({
    account_id: params.accountId,
    table_id: params.tableId,
    seat_id: params.seatId,
    amount: params.amount,
    idempotency_key: params.idempotencyKey,
    hand_id: params.handId,
  });

  return mapResult(call, (response) => ({
    ok: response.ok,
    transactionId: response.transaction_id,
    error: response.error,
    newBalance: parseNumeric(response.new_balance),
  }));
}

export async function recordContribution(
  params: RecordContributionParams,
): Promise<BalanceCall<ContributionResult>> {
  const call = await unaryBalanceClient.RecordContribution({
    table_id: params.tableId,
    hand_id: params.handId,
    seat_id: params.seatId,
    account_id: params.accountId,
    amount: params.amount,
    contribution_type: params.contributionType,
    idempotency_key: params.idempotencyKey,
  });

  return mapResult(call, (response) => ({
    ok: response.ok,
    error: response.error,
    totalPot: parseNumeric(response.total_pot),
    seatContribution: parseNumeric(response.seat_contribution),
  }));
}

export async function settlePot(
  params: SettlePotParams,
): Promise<BalanceCall<SettlementResult>> {
  const call = await unaryBalanceClient.SettlePot({
    table_id: params.tableId,
    hand_id: params.handId,
    winners: params.winners.map((winner) => ({
      seat_id: winner.seatId,
      account_id: winner.accountId,
      amount: winner.amount,
    })),
    idempotency_key: params.idempotencyKey,
  });

  return mapResult(call, (response) => ({
    ok: response.ok,
    error: response.error,
    results: response.results?.map((r) => ({
      accountId: r.account_id,
      transactionId: r.transaction_id,
      amount: parseNumeric(r.amount),
      newBalance: parseNumeric(r.new_balance),
    })),
  }));
}

export async function cancelPot(
  params: CancelPotParams,
): Promise<BalanceCall<{ ok: boolean; error?: string }>> {
  const call = await unaryBalanceClient.CancelPot({
    table_id: params.tableId,
    hand_id: params.handId,
    reason: params.reason,
  });

  return mapResult(call, (response) => ({ ok: response.ok, error: response.error }));
}

export const balanceClient = {
  reserveForBuyIn,
  commitReservation,
  releaseReservation,
  processCashOut,
  recordContribution,
  settlePot,
  cancelPot,
};

export type BalanceClient = typeof balanceClient;
