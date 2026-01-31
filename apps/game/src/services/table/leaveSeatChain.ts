import { isInHandStatus, type Seat, type Table, type TableState } from '../../domain/types';
import { calculatePots } from '../../engine/potCalculator';
import { composeAsyncChain, type AsyncChainHandler } from '@specify-poker/shared/pipeline';

export type LeaveSeatUnlockedResult =
  | { readonly ok: false; readonly error: string }
  | {
      readonly ok: true;
      readonly seatId: number;
      readonly handId: string | undefined;
      readonly remainingStack: number;
    };

export type LeaveSeatChainContext = {
  readonly tableId: string;
  readonly userId: string;
  table?: Table;
  state?: TableState;
  seat?: Seat;
  seatId?: number;
  remainingStack?: number;
};

export type LeaveSeatChainDeps = {
  loadTableAndState(
    tableId: string,
  ): Promise<{ readonly table: Table; readonly state: TableState } | null>;
  resolveSeatForUser(state: TableState, userId: string): Seat | undefined;
  releaseReservation(params: { reservationId: string; reason: string }): Promise<unknown>;
  warn(meta: unknown, message: string): void;
  clearSeatOwnership(seat: Seat): void;
  touchState(state: TableState): void;
  saveState(state: TableState): Promise<void>;
  publishTableAndLobby(table: Table, state: TableState): Promise<void>;
  startTurnTimer(table: Table, state: TableState): Promise<void>;
  findNextActiveTurn(seats: Seat[], startSeatId: number): number | null;
};

type LeaveSeatHandler = AsyncChainHandler<LeaveSeatChainContext, LeaveSeatUnlockedResult>;

function loadSeatAndTable(deps: LeaveSeatChainDeps): LeaveSeatHandler {
  return async (ctx, next) => {
    const loaded = await deps.loadTableAndState(ctx.tableId);
    if (!loaded) {
      return { ok: false, error: 'TABLE_NOT_FOUND' };
    }

    ctx.table = loaded.table;
    ctx.state = loaded.state;

    const seat = deps.resolveSeatForUser(loaded.state, ctx.userId);
    if (!seat) {
      return { ok: false, error: 'PLAYER_NOT_AT_TABLE' };
    }

    if (seat.status === 'RESERVED' && seat.reservationId) {
      const reservationId = seat.reservationId;
      void deps
        .releaseReservation({ reservationId, reason: 'player_left' })
        .catch((error: unknown) => {
          deps.warn(
            { err: error, tableId: ctx.tableId, userId: ctx.userId, reservationId },
            'balance.reservation.release.failed',
          );
        });
    }

    ctx.seat = seat;
    ctx.seatId = seat.seatId;
    ctx.remainingStack = seat.stack;

    return next();
  };
}

function leaveSeatDuringHand(deps: LeaveSeatChainDeps): LeaveSeatHandler {
  return async (ctx, next) => {
    const table = ctx.table;
    const state = ctx.state;
    const seat = ctx.seat;
    const seatId = ctx.seatId;
    const remainingStack = ctx.remainingStack;

    if (!table || !state || !seat || seatId === undefined || remainingStack === undefined) {
      return { ok: false, error: 'INTERNAL' };
    }

    const hand = state.hand;
    if (!hand) {
      return next();
    }

    const handId = hand.handId;
    const wasTurnSeat = hand.turn === seatId;
    const wasInHand = isInHandStatus(seat.status);

    if (wasInHand && seat.status !== 'FOLDED') {
      seat.status = 'FOLDED';
    }

    deps.clearSeatOwnership(seat);

    if (!wasInHand) {
      seat.status = 'EMPTY';
    } else {
      const foldedSeatIds = new Set(
        state.seats.filter((entry) => entry.status === 'FOLDED').map((entry) => entry.seatId),
      );
      hand.pots = calculatePots(hand.totalContributions, foldedSeatIds);
    }

    if (wasTurnSeat) {
      const nextTurn = deps.findNextActiveTurn(state.seats, hand.turn);
      if (nextTurn !== null) {
        hand.turn = nextTurn;
      }
    }

    deps.touchState(state);
    await deps.saveState(state);
    await deps.publishTableAndLobby(table, state);

    if (wasTurnSeat) {
      await deps.startTurnTimer(table, state);
    }

    return { ok: true, seatId, handId, remainingStack };
  };
}

function leaveSeatOutsideHand(deps: LeaveSeatChainDeps): LeaveSeatHandler {
  return async (ctx) => {
    const table = ctx.table;
    const state = ctx.state;
    const seat = ctx.seat;
    const seatId = ctx.seatId;
    const remainingStack = ctx.remainingStack;

    if (!table || !state || !seat || seatId === undefined || remainingStack === undefined) {
      return { ok: false, error: 'INTERNAL' };
    }

    deps.clearSeatOwnership(seat);
    seat.status = 'EMPTY';
    deps.touchState(state);

    await deps.saveState(state);
    await deps.publishTableAndLobby(table, state);

    return { ok: true, seatId, handId: undefined, remainingStack };
  };
}

export function createLeaveSeatChain(
  deps: LeaveSeatChainDeps,
): (ctx: LeaveSeatChainContext) => Promise<LeaveSeatUnlockedResult> {
  const handlers: readonly LeaveSeatHandler[] = [
    loadSeatAndTable(deps),
    leaveSeatDuringHand(deps),
    leaveSeatOutsideHand(deps),
  ];

  return composeAsyncChain(handlers, async () => ({ ok: false, error: 'INTERNAL' }));
}
