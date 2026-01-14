import { randomUUID } from "crypto";
import {
  CommitResult,
  ReleaseResult,
  Reservation,
  ReservationResult,
} from "../domain/types";
import { getBalance, debitBalance } from "./accountService";
import {
  getReservation,
  saveReservation,
  updateReservation,
  getActiveReservationsByAccount,
  getExpiredReservations,
} from "../storage/reservationStore";
import { getIdempotentResponse, setIdempotentResponse } from "../storage/idempotencyStore";
import logger from "../observability/logger";

function now(): string {
  return new Date().toISOString();
}

export async function reserveForBuyIn(
  accountId: string,
  tableId: string,
  amount: number,
  idempotencyKey: string,
  timeoutSeconds?: number
): Promise<ReservationResult> {
  // Check idempotency
  const existingResponse = await getIdempotentResponse(idempotencyKey);
  if (existingResponse) {
    return existingResponse as ReservationResult;
  }

  // Get balance info
  const balanceInfo = await getBalance(accountId);
  if (!balanceInfo) {
    const result: ReservationResult = { ok: false, error: "ACCOUNT_NOT_FOUND" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  // Check available balance
  if (balanceInfo.availableBalance < amount) {
    const result: ReservationResult = {
      ok: false,
      error: "INSUFFICIENT_BALANCE",
      availableBalance: balanceInfo.availableBalance,
    };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  // Create reservation
  const timeoutMs = (timeoutSeconds ?? 30) * 1000;
  const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

  const reservation: Reservation = {
    reservationId: randomUUID(),
    accountId,
    amount,
    tableId,
    idempotencyKey,
    expiresAt,
    status: "HELD",
    createdAt: now(),
    committedAt: null,
    releasedAt: null,
  };

  await saveReservation(reservation);

  const result: ReservationResult = {
    ok: true,
    reservationId: reservation.reservationId,
    availableBalance: balanceInfo.availableBalance - amount,
  };
  await setIdempotentResponse(idempotencyKey, result);
  return result;
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
      releasedAt: now(),
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
    committedAt: now(),
  }));

  return {
    ok: true,
    transactionId: debitResult.transaction?.transactionId,
    newBalance: debitResult.transaction?.balanceAfter,
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
    releasedAt: now(),
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
        releasedAt: now(),
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
