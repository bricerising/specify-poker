import { grpc as defaultGrpc, type GatewayGrpc } from '../../../grpc/unaryClients';
import { getConfig } from '../../../config';
import logger from '../../../observability/logger';
import { isRecord } from '../../../utils/json';

export type JoinSeatResponse = { ok: boolean; error?: string };

export type TablesFacade = {
  joinSeatWithDailyBonus(params: {
    tableId: string;
    userId: string;
    seatId: number;
    buyInAmount: number;
  }): Promise<JoinSeatResponse>;
  resolveTargetUserIdBySeatId(params: {
    tableId: string;
    ownerId: string;
    seatId: number;
  }): Promise<string | null>;
};

type LoggerLike = Pick<typeof logger, 'warn'>;

type TablesFacadeDeps = {
  grpcGame: GatewayGrpc['game'];
  logger: LoggerLike;
  fetch: typeof fetch;
  now: () => Date;
  dailyLoginBonusChips: number;
  dailyLoginBonusErrors: ReadonlySet<string>;
  dailyLoginBonusTimeoutMs: number;
};

const DEFAULT_DAILY_LOGIN_BONUS_ERRORS = new Set(['ACCOUNT_NOT_FOUND', 'INSUFFICIENT_BALANCE']);

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readSeatId(seat: unknown): number | null {
  if (!isRecord(seat)) {
    return null;
  }

  const raw = seat.seat_id ?? seat.seatId;
  if (typeof raw === 'number') {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readSeatUserId(seat: unknown): string | null {
  if (!isRecord(seat)) {
    return null;
  }

  return readNonEmptyString(seat.user_id ?? seat.userId);
}

function isoDate(now: () => Date): string {
  return now().toISOString().slice(0, 10);
}

function balanceBaseUrl(): string {
  const config = getConfig();
  return config.balanceServiceHttpUrl.startsWith('http')
    ? config.balanceServiceHttpUrl
    : `http://${config.balanceServiceHttpUrl}`;
}

export function createTablesFacade(overrides: Partial<TablesFacadeDeps> = {}): TablesFacade {
  const deps: TablesFacadeDeps = {
    grpcGame: overrides.grpcGame ?? defaultGrpc.game,
    logger: overrides.logger ?? logger,
    fetch: overrides.fetch ?? fetch,
    now: overrides.now ?? (() => new Date()),
    dailyLoginBonusChips: overrides.dailyLoginBonusChips ?? 1000,
    dailyLoginBonusErrors: overrides.dailyLoginBonusErrors ?? DEFAULT_DAILY_LOGIN_BONUS_ERRORS,
    dailyLoginBonusTimeoutMs: overrides.dailyLoginBonusTimeoutMs ?? 2_000,
  };

  async function ensureDailyLoginBonus(userId: string): Promise<void> {
    const date = isoDate(deps.now);
    const idempotencyKey = `bonus:daily_login:lobby:${userId}:${date}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), deps.dailyLoginBonusTimeoutMs);

    try {
      const response = await deps.fetch(
        `${balanceBaseUrl()}/api/accounts/${encodeURIComponent(userId)}/deposit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'x-gateway-user-id': userId,
          },
          body: JSON.stringify({ amount: deps.dailyLoginBonusChips, source: 'BONUS' }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        deps.logger.warn({ userId, status: response.status, body }, 'daily_login_bonus.failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      deps.logger.warn({ userId, message }, 'daily_login_bonus.error');
    } finally {
      clearTimeout(timeout);
    }
  }

  async function joinSeatWithDailyBonus(params: {
    tableId: string;
    userId: string;
    seatId: number;
    buyInAmount: number;
  }): Promise<JoinSeatResponse> {
    const grpcRequest = {
      table_id: params.tableId,
      user_id: params.userId,
      seat_id: params.seatId,
      buy_in_amount: params.buyInAmount,
    };

    let response = await deps.grpcGame.JoinSeat(grpcRequest);
    if (!response.ok && deps.dailyLoginBonusErrors.has(response.error ?? '')) {
      await ensureDailyLoginBonus(params.userId);
      response = await deps.grpcGame.JoinSeat(grpcRequest);
    }

    return response;
  }

  async function resolveTargetUserIdBySeatId(params: {
    tableId: string;
    ownerId: string;
    seatId: number;
  }): Promise<string | null> {
    const stateResponse = await deps.grpcGame.GetTableState({
      table_id: params.tableId,
      user_id: params.ownerId,
    });

    const seats = Array.isArray(stateResponse.state?.seats)
      ? (stateResponse.state.seats as unknown[])
      : [];
    const seat = seats.find((candidate) => readSeatId(candidate) === params.seatId);
    return readSeatUserId(seat);
  }

  return { joinSeatWithDailyBonus, resolveTargetUserIdBySeatId };
}
