import { describe, expect, it, vi } from 'vitest';
import { ok } from '@specify-poker/shared';

import type { BalanceHttpClient } from '../../../src/clients/balanceHttpClient';
import type { GatewayGrpc } from '../../../src/grpc/unaryClients';
import { createTablesFacade } from '../../../src/http/routes/tables/facade';

type LoggerLike = { warn(meta: unknown, message?: string): void };

describe('Tables Facade', () => {
  it('retries JoinSeat after daily login bonus on configured errors', async () => {
    const joinSeat = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'ACCOUNT_NOT_FOUND' })
      .mockResolvedValueOnce({ ok: true });

    const deposit = vi.fn().mockResolvedValue(ok(undefined));
    const warn = vi.fn();

    const facade = createTablesFacade({
      grpcGame: { JoinSeat: joinSeat } as unknown as GatewayGrpc['game'],
      balanceHttp: { deposit } as unknown as BalanceHttpClient,
      logger: { warn } as LoggerLike,
      now: () => new Date('2026-01-31T12:00:00.000Z'),
      dailyLoginBonusChips: 123,
      dailyLoginBonusTimeoutMs: 111,
    });

    const result = await facade.joinSeatWithDailyBonus({
      tableId: 't1',
      userId: 'user-1',
      seatId: 0,
      buyInAmount: 200,
    });

    expect(result).toEqual({ ok: true });
    expect(joinSeat).toHaveBeenCalledTimes(2);
    expect(deposit).toHaveBeenCalledTimes(1);
    expect(deposit).toHaveBeenCalledWith({
      accountId: 'user-1',
      amount: 123,
      source: 'BONUS',
      idempotencyKey: 'bonus:daily_login:lobby:user-1:2026-01-31',
      gatewayUserId: 'user-1',
      timeoutMs: 111,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs and still retries JoinSeat if the bonus deposit fails', async () => {
    const joinSeat = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'INSUFFICIENT_BALANCE' })
      .mockResolvedValueOnce({ ok: false, error: 'INSUFFICIENT_BALANCE' });

    const deposit = vi.fn().mockResolvedValue({
      ok: false,
      error: { type: 'fetch_error', message: 'network' },
    });
    const warn = vi.fn();

    const facade = createTablesFacade({
      grpcGame: { JoinSeat: joinSeat } as unknown as GatewayGrpc['game'],
      balanceHttp: { deposit } as unknown as BalanceHttpClient,
      logger: { warn } as LoggerLike,
      now: () => new Date('2026-01-31T12:00:00.000Z'),
    });

    const result = await facade.joinSeatWithDailyBonus({
      tableId: 't1',
      userId: 'user-1',
      seatId: 0,
      buyInAmount: 200,
    });

    expect(result).toEqual({ ok: false, error: 'INSUFFICIENT_BALANCE' });
    expect(joinSeat).toHaveBeenCalledTimes(2);
    expect(deposit).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        error: expect.objectContaining({ type: 'fetch_error' }),
      }),
      'daily_login_bonus.failed',
    );
  });

  it('does not call bonus deposit for non-bonus JoinSeat errors', async () => {
    const joinSeat = vi.fn().mockResolvedValue({ ok: false, error: 'SEAT_NOT_AVAILABLE' });
    const deposit = vi.fn();

    const facade = createTablesFacade({
      grpcGame: { JoinSeat: joinSeat } as unknown as GatewayGrpc['game'],
      balanceHttp: { deposit } as unknown as BalanceHttpClient,
    });

    const result = await facade.joinSeatWithDailyBonus({
      tableId: 't1',
      userId: 'user-1',
      seatId: 0,
      buyInAmount: 200,
    });

    expect(result).toEqual({ ok: false, error: 'SEAT_NOT_AVAILABLE' });
    expect(deposit).not.toHaveBeenCalled();
  });
});
