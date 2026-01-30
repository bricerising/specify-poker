import { randomUUID } from 'crypto';
import type { CommitResult, ReleaseResult, Reservation, ReservationResult } from '../domain/types';
import { getBalance, debitBalance } from './accountService';
import { getConfig } from '../config';
import { nowIso } from '../utils/time';
import {
  planReservationCommit,
  planReservationExpiry,
  planReservationRelease,
} from '../domain/reservationStateMachine';
import {
  getReservation,
  saveReservation,
  updateReservation,
  getActiveReservationsByAccount,
  getExpiredReservations,
  withReservationLock,
} from '../storage/reservationStore';
import logger from '../observability/logger';
import { getCachedIdempotentResponse, withIdempotentResponse } from '../utils/idempotency';
import { withAccountLock } from '../storage/accountStore';
import { getIdempotentResponse } from '../storage/idempotencyStore';
import { BALANCE_SERVICE_ERROR_CODES, type BalanceServiceErrorCode } from '../domain/errors';
import { asFiniteNumber, asString, isRecord } from '../utils/guards';

const BALANCE_SERVICE_ERROR_CODE_SET: ReadonlySet<BalanceServiceErrorCode> = new Set(
  BALANCE_SERVICE_ERROR_CODES,
);

function asBalanceServiceErrorCode(value: unknown): BalanceServiceErrorCode | null {
  const candidate = asString(value);
  return candidate && BALANCE_SERVICE_ERROR_CODE_SET.has(candidate as BalanceServiceErrorCode)
    ? (candidate as BalanceServiceErrorCode)
    : null;
}

function decodeReservationResult(cached: unknown): ReservationResult | null {
  if (!isRecord(cached) || typeof cached.ok !== 'boolean') {
    return null;
  }

  if (cached.ok) {
    const reservationId = asString(cached.reservationId);
    const availableBalance = asFiniteNumber(cached.availableBalance);

    if (!reservationId || availableBalance === null) {
      return null;
    }

    return { ok: true, reservationId, availableBalance };
  }

  const error = asBalanceServiceErrorCode(cached.error);
  const availableBalance =
    cached.availableBalance === undefined ? undefined : asFiniteNumber(cached.availableBalance);

  if (!error || (cached.availableBalance !== undefined && availableBalance === null)) {
    return null;
  }

  return {
    ok: false,
    error,
    availableBalance: availableBalance ?? undefined,
  };
}

async function getCommitTransactionId(reservationId: string): Promise<string | null> {
  const cached = await getIdempotentResponse(`commit-${reservationId}`);
  if (!isRecord(cached) || cached.ok !== true) {
    return null;
  }

  const value = cached.value ?? cached.transaction;
  if (!isRecord(value)) {
    return null;
  }
  const transactionId = asString(value.transactionId);
  if (!transactionId) {
    return null;
  }

  return transactionId;
}

export async function reserveForBuyIn(
  accountId: string,
  tableId: string,
  amount: number,
  idempotencyKey: string,
  timeoutSeconds?: number,
): Promise<ReservationResult> {
  const cached = await getCachedIdempotentResponse<ReservationResult>(idempotencyKey, {
    decodeCached: decodeReservationResult,
  });
  if (cached !== null) {
    return cached;
  }

  return withAccountLock(accountId, () =>
    withIdempotentResponse(
      idempotencyKey,
      async () => {
        if (amount <= 0) {
          return { ok: false, error: 'INVALID_AMOUNT' };
        }

        // Get balance info
        const balanceInfo = await getBalance(accountId);
        if (!balanceInfo) {
          return { ok: false, error: 'ACCOUNT_NOT_FOUND' };
        }

        // Check available balance
        if (balanceInfo.availableBalance < amount) {
          return {
            ok: false,
            error: 'INSUFFICIENT_BALANCE',
            availableBalance: balanceInfo.availableBalance,
          };
        }

        // Create reservation
        const config = getConfig();
        const timeoutMs =
          typeof timeoutSeconds === 'number' && Number.isFinite(timeoutSeconds)
            ? Math.max(0, timeoutSeconds) * 1000
            : config.reservationTimeoutMs;
        const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

        const reservation: Reservation = {
          reservationId: randomUUID(),
          accountId,
          amount,
          tableId,
          idempotencyKey,
          transactionId: null,
          expiresAt,
          status: 'HELD',
          createdAt: nowIso(),
          committedAt: null,
          releasedAt: null,
        };

        await saveReservation(reservation);

        return {
          ok: true,
          reservationId: reservation.reservationId,
          availableBalance: balanceInfo.availableBalance - amount,
        };
      },
      { decodeCached: decodeReservationResult },
    ),
  );
}

export async function commitReservation(reservationId: string): Promise<CommitResult> {
  return withReservationLock(reservationId, async () => {
    const reservation = await getReservation(reservationId);
    if (!reservation) {
      return { ok: false, error: 'RESERVATION_NOT_FOUND' };
    }

    const now = new Date();
    const nowMs = now.getTime();
    const nowIsoString = now.toISOString();

    const plan = planReservationCommit(reservation, nowMs, nowIsoString);
    if (plan.type === 'already_committed') {
      // Already committed - return success (idempotent)
      const balanceInfo = await getBalance(reservation.accountId);
      const transactionId =
        reservation.transactionId ??
        (await getCommitTransactionId(reservationId)) ??
        `committed-${reservationId}`;
      return {
        ok: true,
        transactionId,
        newBalance: balanceInfo?.balance,
      };
    }

    if (plan.type === 'reject') {
      return { ok: false, error: plan.error };
    }

    if (plan.type === 'expire_then_reject') {
      await updateReservation(reservationId, () => plan.updatedReservation);
      return { ok: false, error: plan.error };
    }

    // Debit the balance
    const debitResult = await debitBalance(
      reservation.accountId,
      reservation.amount,
      'BUY_IN',
      `commit-${reservationId}`,
      {
        tableId: reservation.tableId,
        reservationId: reservation.reservationId,
      },
      { useAvailableBalance: false },
    );

    if (!debitResult.ok) {
      return { ok: false, error: debitResult.error };
    }

    // Mark reservation as committed
    await updateReservation(reservationId, (r) => ({
      ...r,
      status: 'COMMITTED',
      committedAt: plan.committedAt,
      transactionId: debitResult.value.transactionId,
    }));

    return {
      ok: true,
      transactionId: debitResult.value.transactionId,
      newBalance: debitResult.value.balanceAfter,
    };
  });
}

export async function releaseReservation(
  reservationId: string,
  _reason?: string,
): Promise<ReleaseResult> {
  return withReservationLock(reservationId, async () => {
    const reservation = await getReservation(reservationId);
    if (!reservation) {
      return { ok: false, error: 'RESERVATION_NOT_FOUND' };
    }

    const releasedAt = nowIso();
    const plan = planReservationRelease(reservation, releasedAt);
    if (plan.type === 'already_released') {
      const balanceInfo = await getBalance(reservation.accountId);
      return { ok: true, availableBalance: balanceInfo?.availableBalance };
    }
    if (plan.type === 'reject') {
      return { ok: false, error: plan.error };
    }

    await updateReservation(reservationId, (r) => ({
      ...r,
      status: 'RELEASED',
      releasedAt: plan.releasedAt,
    }));

    const balanceInfo = await getBalance(reservation.accountId);
    return { ok: true, availableBalance: balanceInfo?.availableBalance };
  });
}

export async function processExpiredReservations(): Promise<number> {
  const now = new Date();
  const nowMs = now.getTime();
  const nowIsoString = now.toISOString();

  const expired = await getExpiredReservations(nowMs);
  let count = 0;

  for (const reservation of expired) {
    await withReservationLock(reservation.reservationId, async () => {
      const current = await getReservation(reservation.reservationId);
      if (!current) {
        return;
      }

      const plan = planReservationExpiry(current, nowMs, nowIsoString);
      if (plan.type !== 'expire') {
        return;
      }

      await updateReservation(current.reservationId, () => plan.updatedReservation);
      count += 1;
      logger.info(
        {
          reservationId: current.reservationId,
          accountId: current.accountId,
          amount: current.amount,
        },
        'reservation.expired',
      );
    });
  }

  return count;
}

export async function getAccountReservations(accountId: string): Promise<Reservation[]> {
  return getActiveReservationsByAccount(accountId);
}
