import * as grpc from '@grpc/grpc-js';
import {
  createUnaryHandler,
  withUnaryErrorHandling,
  withUnaryTiming,
} from '@specify-poker/shared';
import type { BalanceService } from '../../services/balanceService';
import { recordGrpcRequest } from '../../observability/metrics';
import logger from '../../observability/logger';
import { shouldLogGrpcError, toGrpcServiceError } from './errors';
import {
  optionalNonEmptyString,
  optionalPositiveNumber,
  requireNonEmptyString,
  requireNonNegativeInt,
  requireNonNegativeNumber,
  requirePositiveNumber,
} from './validation';

function createBalanceUnaryHandler<Req, Res>(
  method: string,
  handler: (request: Req) => Promise<Res> | Res,
): grpc.handleUnaryCall<Req, Res> {
  return createUnaryHandler<Req, Res, grpc.ServerUnaryCall<Req, Res>, grpc.ServiceError>({
    handler: ({ request }) => handler(request),
    interceptors: [
      withUnaryTiming({ method, record: recordGrpcRequest }),
      withUnaryErrorHandling({
        method,
        logger,
        toServiceError: toGrpcServiceError,
        shouldLog: shouldLogGrpcError,
      }),
    ],
  });
}

export function createGrpcHandlers(service: BalanceService) {
  return {
    GetBalance: createBalanceUnaryHandler(
      'GetBalance',
      async ({ account_id }: { account_id: string }) => {
        const accountId = requireNonEmptyString(account_id, 'account_id');
        const balance = await service.getBalance(accountId);
        if (!balance) {
          return {
            account_id: accountId,
            balance: 0,
            available_balance: 0,
            currency: 'CHIPS',
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
      },
    ),

    EnsureAccount: createBalanceUnaryHandler(
      'EnsureAccount',
      async ({
        account_id,
        initial_balance,
      }: {
        account_id: string;
        initial_balance?: number;
      }) => {
        const accountId = requireNonEmptyString(account_id, 'account_id');
        const initialBalance = requireNonNegativeNumber(initial_balance ?? 0, 'initial_balance');
        const result = await service.ensureAccount(accountId, initialBalance);
        return {
          account_id: result.account.accountId,
          balance: result.account.balance,
          created: result.created,
        };
      },
    ),

    ReserveForBuyIn: createBalanceUnaryHandler(
      'ReserveForBuyIn',
      async (request: {
        account_id: string;
        table_id: string;
        amount: number;
        idempotency_key: string;
        timeout_seconds?: number;
      }) => {
        const accountId = requireNonEmptyString(request.account_id, 'account_id');
        const tableId = requireNonEmptyString(request.table_id, 'table_id');
        const idempotencyKey = requireNonEmptyString(request.idempotency_key, 'idempotency_key');
        const amount = requirePositiveNumber(request.amount, 'amount');
        const timeoutSeconds = optionalPositiveNumber(request.timeout_seconds);

        const result = await service.reserveForBuyIn(
          accountId,
          tableId,
          amount,
          idempotencyKey,
          timeoutSeconds,
        );

        return {
          ok: result.ok,
          reservation_id: result.ok ? result.reservationId : '',
          error: result.ok ? '' : result.error,
          available_balance: result.availableBalance ?? 0,
        };
      },
    ),

    CommitReservation: createBalanceUnaryHandler(
      'CommitReservation',
      async ({ reservation_id }: { reservation_id: string }) => {
        const reservationId = requireNonEmptyString(reservation_id, 'reservation_id');
        const result = await service.commitReservation(reservationId);
        return {
          ok: result.ok,
          transaction_id: result.ok ? result.transactionId : '',
          error: result.ok ? '' : result.error,
          new_balance: result.ok ? (result.newBalance ?? 0) : 0,
        };
      },
    ),

    ReleaseReservation: createBalanceUnaryHandler(
      'ReleaseReservation',
      async ({ reservation_id, reason }: { reservation_id: string; reason?: string }) => {
        const reservationId = requireNonEmptyString(reservation_id, 'reservation_id');
        const result = await service.releaseReservation(reservationId, reason);
        return {
          ok: result.ok,
          error: result.ok ? '' : result.error,
          available_balance: result.ok ? (result.availableBalance ?? 0) : 0,
        };
      },
    ),

    ProcessCashOut: createBalanceUnaryHandler(
      'ProcessCashOut',
      async (request: {
        account_id: string;
        table_id: string;
        seat_id: number;
        amount: number;
        idempotency_key: string;
        hand_id?: string;
      }) => {
        const accountId = requireNonEmptyString(request.account_id, 'account_id');
        const tableId = requireNonEmptyString(request.table_id, 'table_id');
        const idempotencyKey = requireNonEmptyString(request.idempotency_key, 'idempotency_key');
        const seatId = requireNonNegativeInt(request.seat_id, 'seat_id');
        const amount = requirePositiveNumber(request.amount, 'amount');
        const handId = optionalNonEmptyString(request.hand_id);

        const result = await service.processCashOut(
          accountId,
          tableId,
          seatId,
          amount,
          idempotencyKey,
          handId,
        );

        return {
          ok: result.ok,
          transaction_id: result.ok ? result.transactionId : '',
          error: result.ok ? '' : result.error,
          new_balance: result.ok ? result.newBalance : 0,
        };
      },
    ),

    RecordContribution: createBalanceUnaryHandler(
      'RecordContribution',
      async (request: {
        table_id: string;
        hand_id: string;
        seat_id: number;
        account_id: string;
        amount: number;
        contribution_type: string;
        idempotency_key: string;
      }) => {
        const tableId = requireNonEmptyString(request.table_id, 'table_id');
        const handId = requireNonEmptyString(request.hand_id, 'hand_id');
        const accountId = requireNonEmptyString(request.account_id, 'account_id');
        const contributionType = requireNonEmptyString(
          request.contribution_type,
          'contribution_type',
        );
        const idempotencyKey = requireNonEmptyString(request.idempotency_key, 'idempotency_key');
        const seatId = requireNonNegativeInt(request.seat_id, 'seat_id');
        const amount = requirePositiveNumber(request.amount, 'amount');

        const result = await service.recordContribution(
          tableId,
          handId,
          seatId,
          accountId,
          amount,
          contributionType,
          idempotencyKey,
        );

        return {
          ok: result.ok,
          error: result.ok ? '' : result.error,
          total_pot: result.ok ? result.totalPot : 0,
          seat_contribution: result.ok ? result.seatContribution : 0,
        };
      },
    ),

    SettlePot: createBalanceUnaryHandler(
      'SettlePot',
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
        const tableId = requireNonEmptyString(table_id, 'table_id');
        const handId = requireNonEmptyString(hand_id, 'hand_id');
        const idempotencyKey = requireNonEmptyString(idempotency_key, 'idempotency_key');

        const parsedWinners = winners.map((winner) => {
          const accountId = requireNonEmptyString(winner.account_id, 'winner.account_id');
          const seatId = requireNonNegativeInt(winner.seat_id, 'winner.seat_id');
          const amount = requireNonNegativeNumber(winner.amount, 'winner.amount');
          return { seatId, accountId, amount };
        });

        const result = await service.settlePot(tableId, handId, parsedWinners, idempotencyKey);

        return {
          ok: result.ok,
          error: result.ok ? '' : result.error,
          results: result.ok
            ? result.results.map((r) => ({
                account_id: r.accountId,
                transaction_id: r.transactionId,
                amount: r.amount,
                new_balance: r.newBalance,
              }))
            : [],
        };
      },
    ),

    CancelPot: createBalanceUnaryHandler(
      'CancelPot',
      async ({
        table_id,
        hand_id,
        reason,
      }: {
        table_id: string;
        hand_id: string;
        reason: string;
      }) => {
        const tableId = requireNonEmptyString(table_id, 'table_id');
        const handId = requireNonEmptyString(hand_id, 'hand_id');
        const cancelReason = requireNonEmptyString(reason, 'reason');

        const result = await service.cancelPot(tableId, handId, cancelReason);
        return {
          ok: result.ok,
          error: result.error ?? '',
        };
      },
    ),
  } as const;
}

export type GrpcHandlers = ReturnType<typeof createGrpcHandlers>;
