import type { Reservation } from '../domain/types';
import logger from '../observability/logger';
import { tryJsonParse } from '../utils/json';
import { createKeyedLock } from '../utils/keyedLock';
import { getRedisClient } from './redisClient';

const RESERVATIONS_KEY = 'balance:reservations';
const RESERVATIONS_BY_ACCOUNT_PREFIX = 'balance:reservations:by-account:';
const RESERVATIONS_EXPIRY_KEY = 'balance:reservations:expiry';

// In-memory cache
const reservations = new Map<string, Reservation>();
const reservationsByAccount = new Map<string, Set<string>>();
const reservationLock = createKeyedLock();

export async function withReservationLock<T>(
  reservationId: string,
  work: () => Promise<T>,
): Promise<T> {
  return reservationLock.withLock(reservationId, work);
}

export async function getReservation(reservationId: string): Promise<Reservation | null> {
  const cached = reservations.get(reservationId);
  if (cached) {
    return cached;
  }

  const redis = await getRedisClient();
  if (redis) {
    const payload = await redis.hGet(RESERVATIONS_KEY, reservationId);
    if (payload) {
      const parsed = tryJsonParse<Reservation>(payload);
      if (!parsed.ok) {
        logger.warn({ err: parsed.error, reservationId }, 'reservationStore.parse.failed');
        return null;
      }
      const reservation = parsed.value;
      reservations.set(reservationId, reservation);
      return reservation;
    }
  }

  return null;
}

export async function saveReservation(reservation: Reservation): Promise<void> {
  reservations.set(reservation.reservationId, reservation);

  // Update by-account index
  let accountReservations = reservationsByAccount.get(reservation.accountId);
  if (!accountReservations) {
    accountReservations = new Set();
    reservationsByAccount.set(reservation.accountId, accountReservations);
  }
  accountReservations.add(reservation.reservationId);

  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(RESERVATIONS_KEY, reservation.reservationId, JSON.stringify(reservation));
    await redis.sAdd(
      `${RESERVATIONS_BY_ACCOUNT_PREFIX}${reservation.accountId}`,
      reservation.reservationId,
    );

    // Add to expiry sorted set if status is HELD
    if (reservation.status === 'HELD') {
      await redis.zAdd(RESERVATIONS_EXPIRY_KEY, {
        score: new Date(reservation.expiresAt).getTime(),
        value: reservation.reservationId,
      });
    }
  }
}

export async function updateReservation(
  reservationId: string,
  updater: (current: Reservation) => Reservation,
): Promise<Reservation | null> {
  const current = await getReservation(reservationId);
  if (!current) {
    return null;
  }

  const updated = updater(current);
  reservations.set(reservationId, updated);

  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(RESERVATIONS_KEY, reservationId, JSON.stringify(updated));

    // Remove from expiry set if no longer HELD
    if (updated.status !== 'HELD') {
      await redis.zRem(RESERVATIONS_EXPIRY_KEY, reservationId);
    }
  }

  return updated;
}

export async function getReservationsByAccount(accountId: string): Promise<Reservation[]> {
  const redis = await getRedisClient();
  if (redis) {
    const reservationIds = await redis.sMembers(`${RESERVATIONS_BY_ACCOUNT_PREFIX}${accountId}`);
    const result: Reservation[] = [];
    for (const id of reservationIds) {
      const reservation = await getReservation(id);
      if (reservation) {
        result.push(reservation);
      }
    }
    return result;
  }

  const accountReservations = reservationsByAccount.get(accountId);
  if (!accountReservations) {
    return [];
  }

  const result: Reservation[] = [];
  for (const id of accountReservations) {
    const reservation = reservations.get(id);
    if (reservation) {
      result.push(reservation);
    }
  }
  return result;
}

export async function getActiveReservationsByAccount(accountId: string): Promise<Reservation[]> {
  const all = await getReservationsByAccount(accountId);
  return all.filter((r) => r.status === 'HELD');
}

export async function getExpiredReservations(beforeTimestamp: number): Promise<Reservation[]> {
  const redis = await getRedisClient();
  if (redis) {
    const reservationIds = await redis.zRangeByScore(RESERVATIONS_EXPIRY_KEY, 0, beforeTimestamp);
    const result: Reservation[] = [];
    for (const id of reservationIds) {
      const reservation = await getReservation(id);
      if (reservation && reservation.status === 'HELD') {
        result.push(reservation);
      }
    }
    return result;
  }

  // Fallback to in-memory
  const result: Reservation[] = [];
  for (const reservation of reservations.values()) {
    if (
      reservation.status === 'HELD' &&
      new Date(reservation.expiresAt).getTime() <= beforeTimestamp
    ) {
      result.push(reservation);
    }
  }
  return result;
}

export async function resetReservations(): Promise<void> {
  reservations.clear();
  reservationsByAccount.clear();
  reservationLock.reset();

  const redis = await getRedisClient();
  if (redis) {
    await redis.del(RESERVATIONS_KEY);
    await redis.del(RESERVATIONS_EXPIRY_KEY);
  }
}
