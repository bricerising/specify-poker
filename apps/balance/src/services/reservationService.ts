import { randomUUID } from "crypto";
import {
  CommitResult,
  ReleaseResult,
  Reservation,
  ReservationResult,
} from "../domain/types";
import { getBalance, debitBalance } from "./accountService";
import { nowIso } from "../utils/time";
import {
  getReservation,
  saveReservation,
  updateReservation,
  getActiveReservationsByAccount,
  getExpiredReservations,
} from "../storage/reservationStore";
import logger from "../observability/logger";
import { withIdempotentResponse } from "../utils/idempotency";

/** Default timeout for reservations in seconds */
const DEFAULT_RESERVATION_TIMEOUT_SECONDS = 30;

export async function reserveForBuyIn(
  accountId: string,
  tableId: string,
  amount: number,
  idempotencyKey: string,
  timeoutSeconds?: number
): Promise<ReservationResult> {
  return withIdempotentResponse(idempotencyKey, async () => {
    if (amount <= 0) {
      return { ok: false, error: "INVALID_AMOUNT" };
    }

    // Get balance info
    const balanceInfo = await getBalance(accountId);
    if (!balanceInfo) {
      return { ok: false, error: "ACCOUNT_NOT_FOUND" };
    }

    // Check available balance
    if (balanceInfo.availableBalance < amount) {
      return {
        ok: false,
        error: "INSUFFICIENT_BALANCE",
        availableBalance: balanceInfo.availableBalance,
      };
    }

    // Create reservation
    const timeoutMs = (timeoutSeconds ?? DEFAULT_RESERVATION_TIMEOUT_SECONDS) * 1000;
    const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

    const reservation: Reservation = {
      reservationId: randomUUID(),
      accountId,
      amount,
      tableId,
      idempotencyKey,
      expiresAt,
      status: "HELD",
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
  });
}

export async function commitReservation(reservationId: string): Promise<CommitResult> {
  const reservation = await getReservation(reservationId);
  if (!reservation) {
    return { ok: false, error: "RESERVATION_NOT_FOUND" };
  }

  if (reservation.status === "COMMITTED") {
    // Already committed - return success (idempotent)
    const balanceInfo = await getBalance(reservation.accountId);
    return {
      ok: true,
      transactionId: `committed-${reservationId}`,
      newBalance: balanceInfo?.balance,
    };
  }

  if (reservation.status === "EXPIRED") {
    return { ok: false, error: "RESERVATION_EXPIRED" };
  }

  if (reservation.status !== "HELD") {
    return { ok: false, error: "RESERVATION_NOT_HELD" };
  }

  // Check if expired
  if (new Date(reservation.expiresAt) < new Date()) {
    await updateReservation(reservationId, (r) => ({
      ...r,
      status: "EXPIRED",
      releasedAt: nowIso(),
    }));
    return { ok: false, error: "RESERVATION_EXPIRED" };
  }

  // Debit the balance
  const debitResult = await debitBalance(
    reservation.accountId,
    reservation.amount,
    "BUY_IN",
    `commit-${reservationId}`,
    {
      tableId: reservation.tableId,
      reservationId: reservation.reservationId,
    },
    { useAvailableBalance: false }
  );

  if (!debitResult.ok) {
    return { ok: false, error: debitResult.error };
  }

  // Mark reservation as committed
  await updateReservation(reservationId, (r) => ({
    ...r,
    status: "COMMITTED",
    committedAt: nowIso(),
  }));

  return {
    ok: true,
    transactionId: debitResult.transaction.transactionId,
    newBalance: debitResult.transaction.balanceAfter,
  };
}

export async function releaseReservation(
  reservationId: string,
  _reason?: string
): Promise<ReleaseResult> {
  const reservation = await getReservation(reservationId);
  if (!reservation) {
    return { ok: false, error: "RESERVATION_NOT_FOUND" };
  }

  if (reservation.status === "RELEASED" || reservation.status === "EXPIRED") {
    // Already released - return success (idempotent)
    const balanceInfo = await getBalance(reservation.accountId);
    return { ok: true, availableBalance: balanceInfo?.availableBalance };
  }

  if (reservation.status === "COMMITTED") {
    return { ok: false, error: "ALREADY_COMMITTED" };
  }

  // Release the reservation
  await updateReservation(reservationId, (r) => ({
    ...r,
    status: "RELEASED",
    releasedAt: nowIso(),
  }));

  const balanceInfo = await getBalance(reservation.accountId);
  return { ok: true, availableBalance: balanceInfo?.availableBalance };
}

export async function processExpiredReservations(): Promise<number> {
  const expired = await getExpiredReservations(Date.now());
  let count = 0;

  for (const reservation of expired) {
    if (reservation.status === "HELD") {
      await updateReservation(reservation.reservationId, (r) => ({
        ...r,
        status: "EXPIRED",
        releasedAt: nowIso(),
      }));
      count++;
      logger.info({
        reservationId: reservation.reservationId,
        accountId: reservation.accountId,
        amount: reservation.amount,
      }, "reservation.expired");
    }
  }

  return count;
}

export async function getAccountReservations(accountId: string): Promise<Reservation[]> {
  return getActiveReservationsByAccount(accountId);
}
