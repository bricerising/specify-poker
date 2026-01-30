import type { Reservation, ReservationStatus } from './types';
import type { ReservationErrorCode } from './errors';

export type ReservationCommitPlan =
  | { type: 'already_committed' }
  | { type: 'reject'; error: ReservationErrorCode }
  | { type: 'expire_then_reject'; error: ReservationErrorCode; updatedReservation: Reservation }
  | { type: 'debit_then_commit'; committedAt: string };

export type ReservationReleasePlan =
  | { type: 'already_released' }
  | { type: 'reject'; error: ReservationErrorCode }
  | { type: 'release'; releasedAt: string };

export type ReservationExpirePlan = { type: 'noop' } | { type: 'expire'; updatedReservation: Reservation };

type StateContext = {
  reservation: Reservation;
  nowMs: number;
  nowIso: string;
};

type ReservationState = {
  onCommit(ctx: StateContext): ReservationCommitPlan;
  onRelease(ctx: StateContext): ReservationReleasePlan;
  onExpire(ctx: StateContext): ReservationExpirePlan;
};

function isExpired(reservation: Reservation, nowMs: number): boolean {
  return new Date(reservation.expiresAt).getTime() <= nowMs;
}

function expireReservation(reservation: Reservation, nowIso: string): Reservation {
  return {
    ...reservation,
    status: 'EXPIRED',
    releasedAt: nowIso,
  };
}

const heldState: ReservationState = {
  onCommit: ({ reservation, nowMs, nowIso }) => {
    if (isExpired(reservation, nowMs)) {
      return {
        type: 'expire_then_reject',
        error: 'RESERVATION_EXPIRED',
        updatedReservation: expireReservation(reservation, nowIso),
      };
    }
    return { type: 'debit_then_commit', committedAt: nowIso };
  },
  onRelease: ({ nowIso }) => ({ type: 'release', releasedAt: nowIso }),
  onExpire: ({ reservation, nowMs, nowIso }) =>
    isExpired(reservation, nowMs)
      ? { type: 'expire', updatedReservation: expireReservation(reservation, nowIso) }
      : { type: 'noop' },
};

const committedState: ReservationState = {
  onCommit: () => ({ type: 'already_committed' }),
  onRelease: () => ({ type: 'reject', error: 'ALREADY_COMMITTED' }),
  onExpire: () => ({ type: 'noop' }),
};

const releasedState: ReservationState = {
  onCommit: () => ({ type: 'reject', error: 'RESERVATION_NOT_HELD' }),
  onRelease: () => ({ type: 'already_released' }),
  onExpire: () => ({ type: 'noop' }),
};

const expiredState: ReservationState = {
  onCommit: () => ({ type: 'reject', error: 'RESERVATION_EXPIRED' }),
  onRelease: () => ({ type: 'already_released' }),
  onExpire: () => ({ type: 'noop' }),
};

const states: Record<ReservationStatus, ReservationState> = {
  HELD: heldState,
  COMMITTED: committedState,
  RELEASED: releasedState,
  EXPIRED: expiredState,
};

export function planReservationCommit(
  reservation: Reservation,
  nowMs: number,
  nowIso: string,
): ReservationCommitPlan {
  return states[reservation.status].onCommit({ reservation, nowMs, nowIso });
}

export function planReservationRelease(
  reservation: Reservation,
  nowIso: string,
): ReservationReleasePlan {
  return states[reservation.status].onRelease({
    reservation,
    nowMs: new Date(nowIso).getTime(),
    nowIso,
  });
}

export function planReservationExpiry(
  reservation: Reservation,
  nowMs: number,
  nowIso: string,
): ReservationExpirePlan {
  return states[reservation.status].onExpire({ reservation, nowMs, nowIso });
}

