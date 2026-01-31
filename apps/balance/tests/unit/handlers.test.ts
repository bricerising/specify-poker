import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGrpcHandlers } from '../../src/api/grpc/handlers';
import type { BalanceService } from '../../src/services/balanceService';

function createMockBalanceService(
  overrides: Partial<Record<keyof BalanceService, unknown>> = {},
): BalanceService {
  const notImplemented = (name: string) =>
    vi.fn(async (..._args: unknown[]) => {
      throw new Error(`Not implemented: ${name}`);
    });

  const service: BalanceService = {
    getBalance: notImplemented('getBalance'),
    ensureAccount: notImplemented('ensureAccount'),
    processDeposit: notImplemented('processDeposit'),
    processWithdrawal: notImplemented('processWithdrawal'),
    processCashOut: notImplemented('processCashOut'),
    reserveForBuyIn: notImplemented('reserveForBuyIn'),
    commitReservation: notImplemented('commitReservation'),
    releaseReservation: notImplemented('releaseReservation'),
    recordContribution: notImplemented('recordContribution'),
    settlePot: notImplemented('settlePot'),
    cancelPot: notImplemented('cancelPot'),
    queryLedger: notImplemented('queryLedger'),
    getTransactionsByAccount: notImplemented('getTransactionsByAccount'),
  };

  return { ...service, ...(overrides as Partial<BalanceService>) };
}

describe('gRPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GetBalance should return balance', async () => {
    const service = createMockBalanceService({
      getBalance: vi.fn().mockResolvedValue({
        accountId: 'a1',
        balance: 1000,
        availableBalance: 800,
        currency: 'CHIPS',
        version: 5,
      }),
    });
    const handlers = createGrpcHandlers(service);

    const call = { request: { account_id: 'a1' } } as unknown as Parameters<
      typeof handlers.GetBalance
    >[0];
    const callback = vi.fn();

    await handlers.GetBalance(call, callback);

    expect(service.getBalance).toHaveBeenCalledWith('a1');
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        account_id: 'a1',
        balance: 1000,
      }),
    );
  });

  it('EnsureAccount should call service', async () => {
    const service = createMockBalanceService({
      ensureAccount: vi.fn().mockResolvedValue({
        account: {
          accountId: 'a1',
          balance: 100,
          currency: 'CHIPS',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        created: true,
      }),
    });
    const handlers = createGrpcHandlers(service);

    const call = { request: { account_id: 'a1', initial_balance: 100 } } as unknown as Parameters<
      typeof handlers.EnsureAccount
    >[0];
    const callback = vi.fn();

    await handlers.EnsureAccount(call, callback);

    expect(service.ensureAccount).toHaveBeenCalledWith('a1', 100);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        created: true,
      }),
    );
  });

  it('ReserveForBuyIn should call service', async () => {
    const service = createMockBalanceService({
      reserveForBuyIn: vi.fn().mockResolvedValue({
        ok: true,
        reservationId: 'r1',
        availableBalance: 0,
      }),
    });
    const handlers = createGrpcHandlers(service);

    const call = {
      request: { account_id: 'a1', table_id: 't1', amount: 50, idempotency_key: 'k1' },
    } as unknown as Parameters<typeof handlers.ReserveForBuyIn>[0];
    const callback = vi.fn();

    await handlers.ReserveForBuyIn(call, callback);

    expect(service.reserveForBuyIn).toHaveBeenCalledWith('a1', 't1', 50, 'k1', undefined);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        ok: true,
        reservation_id: 'r1',
      }),
    );
  });

  it('CommitReservation should call service', async () => {
    const service = createMockBalanceService({
      commitReservation: vi.fn().mockResolvedValue({
        ok: true,
        transactionId: 'tx1',
      }),
    });
    const handlers = createGrpcHandlers(service);

    const call = { request: { reservation_id: 'r1' } } as unknown as Parameters<
      typeof handlers.CommitReservation
    >[0];
    const callback = vi.fn();

    await handlers.CommitReservation(call, callback);

    expect(service.commitReservation).toHaveBeenCalledWith('r1');
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        ok: true,
      }),
    );
  });

  it('ReleaseReservation should call service', async () => {
    const service = createMockBalanceService({
      releaseReservation: vi.fn().mockResolvedValue({
        ok: true,
        availableBalance: 0,
      }),
    });
    const handlers = createGrpcHandlers(service);

    const call = { request: { reservation_id: 'r1', reason: 'cancel' } } as unknown as Parameters<
      typeof handlers.ReleaseReservation
    >[0];
    const callback = vi.fn();

    await handlers.ReleaseReservation(call, callback);

    expect(service.releaseReservation).toHaveBeenCalledWith('r1', 'cancel');
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        ok: true,
      }),
    );
  });

  it('ProcessCashOut should call service', async () => {
    const service = createMockBalanceService({
      processCashOut: vi.fn().mockResolvedValue({
        ok: true,
        transactionId: 'tx2',
        newBalance: 0,
      }),
    });
    const handlers = createGrpcHandlers(service);

    const call = {
      request: { account_id: 'a1', table_id: 't1', seat_id: 1, amount: 200, idempotency_key: 'k2' },
    } as unknown as Parameters<typeof handlers.ProcessCashOut>[0];
    const callback = vi.fn();

    await handlers.ProcessCashOut(call, callback);

    expect(service.processCashOut).toHaveBeenCalledWith('a1', 't1', 1, 200, 'k2', undefined);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        ok: true,
      }),
    );
  });

  it('RecordContribution should call service', async () => {
    const service = createMockBalanceService({
      recordContribution: vi.fn().mockResolvedValue({
        ok: true,
        totalPot: 100,
        seatContribution: 0,
      }),
    });
    const handlers = createGrpcHandlers(service);

    const call = {
      request: {
        table_id: 't1',
        hand_id: 'h1',
        seat_id: 1,
        account_id: 'a1',
        amount: 10,
        contribution_type: 'BET',
        idempotency_key: 'k3',
      },
    } as unknown as Parameters<typeof handlers.RecordContribution>[0];
    const callback = vi.fn();

    await handlers.RecordContribution(call, callback);

    expect(service.recordContribution).toHaveBeenCalledWith('t1', 'h1', 1, 'a1', 10, 'BET', 'k3');
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        ok: true,
        total_pot: 100,
      }),
    );
  });

  it('SettlePot should call service', async () => {
    const service = createMockBalanceService({
      settlePot: vi.fn().mockResolvedValue({
        ok: true,
        results: [{ accountId: 'a1', transactionId: 'tx3', amount: 100, newBalance: 1100 }],
      }),
    });
    const handlers = createGrpcHandlers(service);

    const call = {
      request: {
        table_id: 't1',
        hand_id: 'h1',
        winners: [{ seat_id: 1, account_id: 'a1', amount: 100 }],
        idempotency_key: 'k4',
      },
    } as unknown as Parameters<typeof handlers.SettlePot>[0];
    const callback = vi.fn();

    await handlers.SettlePot(call, callback);

    expect(service.settlePot).toHaveBeenCalledWith(
      't1',
      'h1',
      [{ seatId: 1, accountId: 'a1', amount: 100 }],
      'k4',
    );
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        ok: true,
      }),
    );
  });

  it('CancelPot should call service', async () => {
    const service = createMockBalanceService({
      cancelPot: vi.fn().mockResolvedValue({
        ok: true,
      }),
    });
    const handlers = createGrpcHandlers(service);

    const call = {
      request: { table_id: 't1', hand_id: 'h1', reason: 'error' },
    } as unknown as Parameters<typeof handlers.CancelPot>[0];
    const callback = vi.fn();

    await handlers.CancelPot(call, callback);

    expect(service.cancelPot).toHaveBeenCalledWith('t1', 'h1', 'error');
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        ok: true,
      }),
    );
  });

  it('should handle errors in handlers', async () => {
    const service = createMockBalanceService({
      getBalance: vi.fn().mockRejectedValue(new Error('Internal')),
    });
    const handlers = createGrpcHandlers(service);

    const call = { request: { account_id: 'a1' } } as unknown as Parameters<
      typeof handlers.GetBalance
    >[0];
    const callback = vi.fn();

    await handlers.GetBalance(call, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
  });
});
