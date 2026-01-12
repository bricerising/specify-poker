import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlers } from '../../src/api/grpc/handlers';
import * as accountService from '../../src/services/accountService';
import * as reservationService from '../../src/services/reservationService';
import * as tablePotService from '../../src/services/tablePotService';

vi.mock('../../src/services/accountService');
vi.mock('../../src/services/reservationService');
vi.mock('../../src/services/tablePotService');

describe('gRPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GetBalance should return balance', async () => {
    const call = { request: { account_id: 'a1' } } as unknown as Parameters<typeof handlers.GetBalance>[0];
    const callback = vi.fn();
    vi.mocked(accountService.getBalance).mockResolvedValue({
      accountId: 'a1',
      balance: 1000,
      availableBalance: 800,
      currency: 'CHIPS',
      version: 5,
    });

    await handlers.GetBalance(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      account_id: 'a1',
      balance: 1000,
    }));
  });

  it('EnsureAccount should call service', async () => {
    const call = { request: { account_id: 'a1', initial_balance: 100 } } as unknown as Parameters<typeof handlers.EnsureAccount>[0];
    const callback = vi.fn();
    vi.mocked(accountService.ensureAccount).mockResolvedValue({
      account: { accountId: 'a1', balance: 100, availableBalance: 100, currency: 'CHIPS', version: 1 },
      created: true,
    });

    await handlers.EnsureAccount(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      created: true,
    }));
  });

  it('ReserveForBuyIn should call service', async () => {
    const call = { request: { account_id: 'a1', table_id: 't1', amount: 50, idempotency_key: 'k1' } } as unknown as Parameters<typeof handlers.ReserveForBuyIn>[0];
    const callback = vi.fn();
    vi.mocked(reservationService.reserveForBuyIn).mockResolvedValue({
      ok: true,
      reservationId: 'r1',
    });

    await handlers.ReserveForBuyIn(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
      reservation_id: 'r1',
    }));
  });

  it('CommitReservation should call service', async () => {
    const call = { request: { reservation_id: 'r1' } } as unknown as Parameters<typeof handlers.CommitReservation>[0];
    const callback = vi.fn();
    vi.mocked(reservationService.commitReservation).mockResolvedValue({
      ok: true,
      transactionId: 'tx1',
    });

    await handlers.CommitReservation(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('ReleaseReservation should call service', async () => {
    const call = { request: { reservation_id: 'r1', reason: 'cancel' } } as unknown as Parameters<typeof handlers.ReleaseReservation>[0];
    const callback = vi.fn();
    vi.mocked(reservationService.releaseReservation).mockResolvedValue({
      ok: true,
    });

    await handlers.ReleaseReservation(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('ProcessCashOut should call service', async () => {
    const call = { request: { account_id: 'a1', table_id: 't1', seat_id: 1, amount: 200, idempotency_key: 'k2' } } as unknown as Parameters<typeof handlers.ProcessCashOut>[0];
    const callback = vi.fn();
    vi.mocked(accountService.processCashOut).mockResolvedValue({
      ok: true,
      transactionId: 'tx2',
    });

    await handlers.ProcessCashOut(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('RecordContribution should call service', async () => {
    const call = { request: { table_id: 't1', hand_id: 'h1', seat_id: 1, account_id: 'a1', amount: 10, contribution_type: 'BET', idempotency_key: 'k3' } } as unknown as Parameters<typeof handlers.RecordContribution>[0];
    const callback = vi.fn();
    vi.mocked(tablePotService.recordContribution).mockResolvedValue({
      ok: true,
      totalPot: 100,
    });

    await handlers.RecordContribution(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
      total_pot: 100,
    }));
  });

  it('SettlePot should call service', async () => {
    const call = { request: { table_id: 't1', hand_id: 'h1', winners: [{ seat_id: 1, account_id: 'a1', amount: 100 }], idempotency_key: 'k4' } } as unknown as Parameters<typeof handlers.SettlePot>[0];
    const callback = vi.fn();
    vi.mocked(tablePotService.settlePot).mockResolvedValue({
      ok: true,
      results: [{ accountId: 'a1', transactionId: 'tx3', amount: 100, newBalance: 1100 }],
    });

    await handlers.SettlePot(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('CancelPot should call service', async () => {
    const call = { request: { table_id: 't1', hand_id: 'h1', reason: 'error' } } as unknown as Parameters<typeof handlers.CancelPot>[0];
    const callback = vi.fn();
    vi.mocked(tablePotService.cancelPot).mockResolvedValue({
      ok: true,
    });

    await handlers.CancelPot(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('should handle errors in handlers', async () => {
    const call = { request: { account_id: 'a1' } } as unknown as Parameters<typeof handlers.GetBalance>[0];
    const callback = vi.fn();
    vi.mocked(accountService.getBalance).mockRejectedValue(new Error('Internal'));

    await handlers.GetBalance(call, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
  });
});
