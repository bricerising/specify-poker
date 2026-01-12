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
    const call = { request: { account_id: 'a1' } };
    const callback = vi.fn();
    (accountService.getBalance as any).mockResolvedValue({
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
    const call = { request: { account_id: 'a1', initial_balance: 100 } };
    const callback = vi.fn();
    (accountService.ensureAccount as any).mockResolvedValue({
      account: { accountId: 'a1', balance: 100 },
      created: true,
    });

    await handlers.EnsureAccount(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      created: true,
    }));
  });

  it('ReserveForBuyIn should call service', async () => {
    const call = { request: { account_id: 'a1', table_id: 't1', amount: 50, idempotency_key: 'k1' } };
    const callback = vi.fn();
    (reservationService.reserveForBuyIn as any).mockResolvedValue({
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
    const call = { request: { reservation_id: 'r1' } };
    const callback = vi.fn();
    (reservationService.commitReservation as any).mockResolvedValue({
      ok: true,
      transactionId: 'tx1',
    });

    await handlers.CommitReservation(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('ReleaseReservation should call service', async () => {
    const call = { request: { reservation_id: 'r1', reason: 'cancel' } };
    const callback = vi.fn();
    (reservationService.releaseReservation as any).mockResolvedValue({
      ok: true,
    });

    await handlers.ReleaseReservation(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('ProcessCashOut should call service', async () => {
    const call = { request: { account_id: 'a1', table_id: 't1', seat_id: 1, amount: 200, idempotency_key: 'k2' } };
    const callback = vi.fn();
    (accountService.processCashOut as any).mockResolvedValue({
      ok: true,
      transactionId: 'tx2',
    });

    await handlers.ProcessCashOut(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('RecordContribution should call service', async () => {
    const call = { request: { table_id: 't1', hand_id: 'h1', seat_id: 1, account_id: 'a1', amount: 10, contribution_type: 'BET', idempotency_key: 'k3' } };
    const callback = vi.fn();
    (tablePotService.recordContribution as any).mockResolvedValue({
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
    const call = { request: { table_id: 't1', hand_id: 'h1', winners: [{ seat_id: 1, account_id: 'a1', amount: 100 }], idempotency_key: 'k4' } };
    const callback = vi.fn();
    (tablePotService.settlePot as any).mockResolvedValue({
      ok: true,
      results: [{ accountId: 'a1', transactionId: 'tx3', amount: 100, newBalance: 1100 }],
    });

    await handlers.SettlePot(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('CancelPot should call service', async () => {
    const call = { request: { table_id: 't1', hand_id: 'h1', reason: 'error' } };
    const callback = vi.fn();
    (tablePotService.cancelPot as any).mockResolvedValue({
      ok: true,
    });

    await handlers.CancelPot(call, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      ok: true,
    }));
  });

  it('should handle errors in handlers', async () => {
    const call = { request: { account_id: 'a1' } };
    const callback = vi.fn();
    (accountService.getBalance as any).mockRejectedValue(new Error('Internal'));

    await handlers.GetBalance(call, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
  });
});
