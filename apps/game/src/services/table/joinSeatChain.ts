import { seatAt } from '../../domain/seats';
import type { Seat, Table, TableState } from '../../domain/types';
import { composeAsyncChain, type AsyncChainHandler } from '@specify-poker/shared/pipeline';
import { buyInIdempotencyKeyPrefix } from './idempotency';

export type JoinSeatResponse = { ok: true } | { ok: false; error: string };

export type JoinSeatChainResult =
  | { readonly type: 'done'; readonly response: JoinSeatResponse }
  | { readonly type: 'finalize'; readonly okMetric: string };

export type JoinSeatChainContext = {
  readonly tableId: string;
  readonly userId: string;
  readonly seatId: number;
  readonly buyInAmount: number;
  readonly table: Table;
  readonly state: TableState;
};

export type JoinSeatChainDeps = {
  newIdempotencyKey(prefix: string): string;
  touchState(state: TableState): void;
  saveState(state: TableState): Promise<void>;
  publishTableAndLobby(table: Table, state: TableState): Promise<void>;
  recordSeatJoin(result: 'ok' | 'error', metric: string): void;
};

type JoinSeatHandler = AsyncChainHandler<JoinSeatChainContext, JoinSeatChainResult>;

function findExistingSeat(state: TableState, userId: string): Seat | undefined {
  return state.seats.find((seat) => seat.userId === userId && seat.status !== 'EMPTY');
}

function handleExistingSeat(deps: JoinSeatChainDeps): JoinSeatHandler {
  return async (ctx, next) => {
    const existingSeat = findExistingSeat(ctx.state, ctx.userId);
    if (!existingSeat) {
      return next();
    }

    if (existingSeat.seatId !== ctx.seatId) {
      deps.recordSeatJoin('error', 'ALREADY_SEATED');
      return { type: 'done', response: { ok: false, error: 'ALREADY_SEATED' } };
    }

    if (existingSeat.status === 'SEATED') {
      deps.recordSeatJoin('ok', 'IDEMPOTENT');
      return { type: 'done', response: { ok: true } };
    }

    if (existingSeat.status !== 'RESERVED') {
      deps.recordSeatJoin('error', 'ALREADY_SEATED');
      return { type: 'done', response: { ok: false, error: 'ALREADY_SEATED' } };
    }

    return { type: 'finalize', okMetric: 'RESUMED' };
  };
}

function handleReserveEmptySeat(deps: JoinSeatChainDeps): JoinSeatHandler {
  return async (ctx, _next) => {
    const seat = seatAt(ctx.state.seats, ctx.seatId);
    if (!seat || seat.userId || seat.status !== 'EMPTY') {
      deps.recordSeatJoin('error', 'SEAT_NOT_AVAILABLE');
      return { type: 'done', response: { ok: false, error: 'SEAT_NOT_AVAILABLE' } };
    }

    seat.userId = ctx.userId;
    seat.status = 'RESERVED';
    seat.pendingBuyInAmount = ctx.buyInAmount;
    seat.buyInIdempotencyKey = deps.newIdempotencyKey(
      buyInIdempotencyKeyPrefix(ctx.tableId, ctx.seatId, ctx.userId),
    );

    deps.touchState(ctx.state);
    await deps.saveState(ctx.state);
    await deps.publishTableAndLobby(ctx.table, ctx.state);

    return { type: 'finalize', okMetric: 'OK' };
  };
}

export function createJoinSeatChain(
  deps: JoinSeatChainDeps,
): (ctx: JoinSeatChainContext) => Promise<JoinSeatChainResult> {
  const handlers: readonly JoinSeatHandler[] = [handleExistingSeat(deps), handleReserveEmptySeat(deps)];

  return composeAsyncChain(handlers, async () => {
    deps.recordSeatJoin('error', 'SEAT_NOT_AVAILABLE');
    return { type: 'done', response: { ok: false, error: 'SEAT_NOT_AVAILABLE' } };
  });
}
