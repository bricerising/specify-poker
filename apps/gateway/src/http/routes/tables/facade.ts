import { grpc as defaultGrpc, type GatewayGrpc } from '../../../grpc/unaryClients';
import logger from '../../../observability/logger';
import { isRecord } from '../../../utils/json';
import { createBalanceHttpClient, type BalanceHttpClient } from '../../../clients/balanceHttpClient';

export type JoinSeatResponse = { ok: boolean; error?: string };

export type TablesFacade = {
  joinSeatWithDailyBonus(params: {
    tableId: string;
    userId: string;
    userToken: string;
    seatId: number;
    buyInAmount: number;
    idempotencyKey: string;
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
  balanceHttp: BalanceHttpClient;
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

export function createTablesFacade(overrides: Partial<TablesFacadeDeps> = {}): TablesFacade {
  const deps: TablesFacadeDeps = {
    grpcGame: overrides.grpcGame ?? defaultGrpc.game,
    logger: overrides.logger ?? logger,
    balanceHttp: overrides.balanceHttp ?? createBalanceHttpClient(),
    now: overrides.now ?? (() => new Date()),
    dailyLoginBonusChips: overrides.dailyLoginBonusChips ?? 1000,
    dailyLoginBonusErrors: overrides.dailyLoginBonusErrors ?? DEFAULT_DAILY_LOGIN_BONUS_ERRORS,
    dailyLoginBonusTimeoutMs: overrides.dailyLoginBonusTimeoutMs ?? 2_000,
  };

  async function ensureDailyLoginBonus(userId: string, userToken: string): Promise<void> {
    const date = isoDate(deps.now);
    const idempotencyKey = `bonus:daily_login:lobby:${userId}:${date}`;

    try {
      const depositResult = await deps.balanceHttp.deposit({
        accountId: userId,
        amount: deps.dailyLoginBonusChips,
        source: 'BONUS',
        idempotencyKey,
        gatewayUserId: userId,
        bearerToken: userToken,
        timeoutMs: deps.dailyLoginBonusTimeoutMs,
      });

      if (!depositResult.ok) {
        deps.logger.warn({ userId, error: depositResult.error }, 'daily_login_bonus.failed');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      deps.logger.warn({ userId, message }, 'daily_login_bonus.error');
    }
  }

  async function joinSeatWithDailyBonus(params: {
    tableId: string;
    userId: string;
    userToken: string;
    seatId: number;
    buyInAmount: number;
    idempotencyKey: string;
  }): Promise<JoinSeatResponse> {
    const grpcRequest = {
      table_id: params.tableId,
      user_id: params.userId,
      seat_id: params.seatId,
      buy_in_amount: params.buyInAmount,
      idempotency_key: params.idempotencyKey,
    };

    let response = await deps.grpcGame.JoinSeat(grpcRequest);
    if (!response.ok && deps.dailyLoginBonusErrors.has(response.error ?? '')) {
      await ensureDailyLoginBonus(params.userId, params.userToken);
      // Retry JoinSeat after ensuring the user has a daily login bonus.
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
