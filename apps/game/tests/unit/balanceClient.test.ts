import { describe, expect, it, vi } from 'vitest';

const balanceState = vi.hoisted(() => ({
  reserveError: null as Error | null,
  commitError: null as Error | null,
  releaseError: null as Error | null,
  cashOutError: null as Error | null,
  contributionError: null as Error | null,
  settleError: null as Error | null,
  cancelError: null as Error | null,
}));

const fakeClient = {
  ReserveForBuyIn: vi.fn(
    (request: unknown, callback: (err: Error | null, response: unknown) => void) => {
      if (balanceState.reserveError) {
        callback(balanceState.reserveError, {} as unknown);
        return;
      }
      callback(null, { ok: true, reservation_id: 'res-1', available_balance: '500' });
    },
  ),
  CommitReservation: vi.fn(
    (request: unknown, callback: (err: Error | null, response: unknown) => void) => {
      if (balanceState.commitError) {
        callback(balanceState.commitError, {} as unknown);
        return;
      }
      callback(null, { ok: true, transaction_id: 'tx-1', new_balance: '450' });
    },
  ),
  ReleaseReservation: vi.fn(
    (request: unknown, callback: (err: Error | null, response: unknown) => void) => {
      if (balanceState.releaseError) {
        callback(balanceState.releaseError, {} as unknown);
        return;
      }
      callback(null, { ok: true });
    },
  ),
  ProcessCashOut: vi.fn(
    (request: unknown, callback: (err: Error | null, response: unknown) => void) => {
      if (balanceState.cashOutError) {
        callback(balanceState.cashOutError, {} as unknown);
        return;
      }
      callback(null, { ok: true, transaction_id: 'tx-2', new_balance: '600' });
    },
  ),
  RecordContribution: vi.fn(
    (request: unknown, callback: (err: Error | null, response: unknown) => void) => {
      if (balanceState.contributionError) {
        callback(balanceState.contributionError, {} as unknown);
        return;
      }
      callback(null, { ok: true, total_pot: '20', seat_contribution: '10' });
    },
  ),
  SettlePot: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    if (balanceState.settleError) {
      callback(balanceState.settleError, {} as unknown);
      return;
    }
    callback(null, {
      ok: true,
      results: [
        { account_id: 'player-1', transaction_id: 'tx-3', amount: '10', new_balance: '610' },
      ],
    });
  }),
  CancelPot: vi.fn((request: unknown, callback: (err: Error | null, response: unknown) => void) => {
    if (balanceState.cancelError) {
      callback(balanceState.cancelError, {} as unknown);
      return;
    }
    callback(null, { ok: true });
  }),
};

vi.mock('@grpc/grpc-js', () => ({
  credentials: { createInsecure: () => ({}) },
  loadPackageDefinition: () => ({
    balance: {
      BalanceService: class {
        constructor() {
          return fakeClient;
        }
      },
    },
  }),
}));

vi.mock('@grpc/proto-loader', () => ({
  loadSync: () => ({}),
}));

vi.mock('../../src/observability/logger', () => ({
  default: { error: vi.fn() },
}));

describe('balance client', () => {
  it('maps successful responses from Balance gRPC', async () => {
    const client = await import('../../src/clients/balanceClient');

    const reserveCall = await client.reserveForBuyIn({
      accountId: 'player-1',
      tableId: 'table-1',
      amount: 50,
      idempotencyKey: 'key-1',
    });
    expect(reserveCall.type).toBe('available');
    if (reserveCall.type === 'available') {
      expect(reserveCall.response.ok).toBe(true);
      expect(reserveCall.response.reservationId).toBe('res-1');
      expect(reserveCall.response.availableBalance).toBe(500);
    }

    const commitCall = await client.commitReservation({ reservationId: 'res-1' });
    expect(commitCall.type).toBe('available');
    if (commitCall.type === 'available') {
      expect(commitCall.response.ok).toBe(true);
      expect(commitCall.response.transactionId).toBe('tx-1');
      expect(commitCall.response.newBalance).toBe(450);
    }

    const releaseCall = await client.releaseReservation({
      reservationId: 'res-1',
      reason: 'timeout',
    });
    expect(releaseCall.type).toBe('available');
    if (releaseCall.type === 'available') {
      expect(releaseCall.response.ok).toBe(true);
    }

    const cashOutCall = await client.processCashOut({
      accountId: 'player-1',
      tableId: 'table-1',
      seatId: 0,
      amount: 20,
      idempotencyKey: 'key-2',
    });
    expect(cashOutCall.type).toBe('available');
    if (cashOutCall.type === 'available') {
      expect(cashOutCall.response.ok).toBe(true);
      expect(cashOutCall.response.newBalance).toBe(600);
    }

    const contributionCall = await client.recordContribution({
      tableId: 'table-1',
      handId: 'hand-1',
      seatId: 0,
      accountId: 'player-1',
      amount: 10,
      contributionType: 'BET',
      idempotencyKey: 'key-3',
    });
    expect(contributionCall.type).toBe('available');
    if (contributionCall.type === 'available') {
      expect(contributionCall.response.ok).toBe(true);
      expect(contributionCall.response.totalPot).toBe(20);
    }

    const settleCall = await client.settlePot({
      tableId: 'table-1',
      handId: 'hand-1',
      winners: [{ seatId: 0, accountId: 'player-1', amount: 10 }],
      idempotencyKey: 'key-4',
    });
    expect(settleCall.type).toBe('available');
    if (settleCall.type === 'available') {
      expect(settleCall.response.ok).toBe(true);
      expect(settleCall.response.results?.[0].newBalance).toBe(610);
    }

    const cancelCall = await client.cancelPot({
      tableId: 'table-1',
      handId: 'hand-1',
      reason: 'table_disbanded',
    });
    expect(cancelCall.type).toBe('available');
    if (cancelCall.type === 'available') {
      expect(cancelCall.response.ok).toBe(true);
    }
  });

  it('returns unavailable results when gRPC fails', async () => {
    const client = await import('../../src/clients/balanceClient');
    balanceState.reserveError = new Error('fail');
    balanceState.commitError = new Error('fail');
    balanceState.releaseError = new Error('fail');
    balanceState.cashOutError = new Error('fail');
    balanceState.contributionError = new Error('fail');
    balanceState.settleError = new Error('fail');
    balanceState.cancelError = new Error('fail');

    const reserveCall = await client.reserveForBuyIn({
      accountId: 'player-1',
      tableId: 'table-1',
      amount: 50,
      idempotencyKey: 'key-1',
    });
    expect(reserveCall.type).toBe('unavailable');

    const commitCall = await client.commitReservation({ reservationId: 'res-1' });
    expect(commitCall.type).toBe('unavailable');

    const releaseCall = await client.releaseReservation({
      reservationId: 'res-1',
      reason: 'timeout',
    });
    expect(releaseCall.type).toBe('unavailable');

    const cashOutCall = await client.processCashOut({
      accountId: 'player-1',
      tableId: 'table-1',
      seatId: 0,
      amount: 20,
      idempotencyKey: 'key-2',
    });
    expect(cashOutCall.type).toBe('unavailable');

    const contributionCall = await client.recordContribution({
      tableId: 'table-1',
      handId: 'hand-1',
      seatId: 0,
      accountId: 'player-1',
      amount: 10,
      contributionType: 'BET',
      idempotencyKey: 'key-3',
    });
    expect(contributionCall.type).toBe('unavailable');

    const settleCall = await client.settlePot({
      tableId: 'table-1',
      handId: 'hand-1',
      winners: [{ seatId: 0, accountId: 'player-1', amount: 10 }],
      idempotencyKey: 'key-4',
    });
    expect(settleCall.type).toBe('unavailable');

    const cancelCall = await client.cancelPot({
      tableId: 'table-1',
      handId: 'hand-1',
      reason: 'table_disbanded',
    });
    expect(cancelCall.type).toBe('unavailable');
  });
});
