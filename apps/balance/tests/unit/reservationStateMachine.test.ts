import { describe, expect, it } from 'vitest';
import type { Reservation } from '../../src/domain/types';
import {
  planReservationCommit,
  planReservationExpiry,
  planReservationRelease,
} from '../../src/domain/reservationStateMachine';

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    reservationId: 'r1',
    accountId: 'a1',
    amount: 100,
    tableId: 't1',
    idempotencyKey: 'k1',
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    status: 'HELD',
    createdAt: new Date().toISOString(),
    committedAt: null,
    releasedAt: null,
    ...overrides,
  };
}

describe('reservationStateMachine', () => {
  describe('planReservationCommit', () => {
    it('returns debit_then_commit for HELD reservations that are not expired', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const reservation = makeReservation({
        expiresAt: new Date('2026-01-01T00:00:10.000Z').toISOString(),
        status: 'HELD',
      });

      const plan = planReservationCommit(reservation, now.getTime(), now.toISOString());
      expect(plan.type).toBe('debit_then_commit');
    });

    it('returns expire_then_reject for HELD reservations that are expired', () => {
      const now = new Date('2026-01-01T00:00:10.000Z');
      const reservation = makeReservation({
        expiresAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        status: 'HELD',
      });

      const plan = planReservationCommit(reservation, now.getTime(), now.toISOString());
      expect(plan.type).toBe('expire_then_reject');
      if (plan.type !== 'expire_then_reject') {
        throw new Error('expected expire_then_reject');
      }
      expect(plan.error).toBe('RESERVATION_EXPIRED');
      expect(plan.updatedReservation.status).toBe('EXPIRED');
      expect(plan.updatedReservation.releasedAt).toBe(now.toISOString());
    });

    it('returns already_committed for COMMITTED reservations', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const reservation = makeReservation({ status: 'COMMITTED' });

      const plan = planReservationCommit(reservation, now.getTime(), now.toISOString());
      expect(plan.type).toBe('already_committed');
    });

    it('rejects commit for RELEASED reservations', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const reservation = makeReservation({ status: 'RELEASED' });

      const plan = planReservationCommit(reservation, now.getTime(), now.toISOString());
      expect(plan.type).toBe('reject');
      if (plan.type !== 'reject') {
        throw new Error('expected reject');
      }
      expect(plan.error).toBe('RESERVATION_NOT_HELD');
    });
  });

  describe('planReservationRelease', () => {
    it('releases HELD reservations', () => {
      const nowIso = new Date('2026-01-01T00:00:00.000Z').toISOString();
      const reservation = makeReservation({ status: 'HELD' });

      const plan = planReservationRelease(reservation, nowIso);
      expect(plan.type).toBe('release');
      if (plan.type !== 'release') {
        throw new Error('expected release');
      }
      expect(plan.releasedAt).toBe(nowIso);
    });

    it('rejects release for COMMITTED reservations', () => {
      const nowIso = new Date('2026-01-01T00:00:00.000Z').toISOString();
      const reservation = makeReservation({ status: 'COMMITTED' });

      const plan = planReservationRelease(reservation, nowIso);
      expect(plan.type).toBe('reject');
      if (plan.type !== 'reject') {
        throw new Error('expected reject');
      }
      expect(plan.error).toBe('ALREADY_COMMITTED');
    });
  });

  describe('planReservationExpiry', () => {
    it('expires HELD reservations that are expired', () => {
      const now = new Date('2026-01-01T00:00:10.000Z');
      const reservation = makeReservation({
        expiresAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        status: 'HELD',
      });

      const plan = planReservationExpiry(reservation, now.getTime(), now.toISOString());
      expect(plan.type).toBe('expire');
      if (plan.type !== 'expire') {
        throw new Error('expected expire');
      }
      expect(plan.updatedReservation.status).toBe('EXPIRED');
      expect(plan.updatedReservation.releasedAt).toBe(now.toISOString());
    });
  });
});

