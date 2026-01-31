import type { ActionInput, Seat, Table, TableState } from '../../domain/types';
import { GameEventType } from '../../domain/events';
import type { ApplyActionResult } from '../../engine/handEngine';
import { composeAsyncChain, type AsyncChainHandler } from '@specify-poker/shared/pipeline';
import { fireAndForget } from '@specify-poker/shared';
import type { GameEventEmitter } from './gameEventEmitter';

export type SubmitActionAcceptedResult = Extract<ApplyActionResult, { accepted: true }>;

export type TurnTimeMetric = {
  readonly street: string;
  readonly durationMs: number;
};

export type SubmitActionChainContext = {
  readonly tableId: string;
  readonly userId: string;
  readonly actionInput: ActionInput;
  readonly actionStreet: string;
  readonly table: Table;
  readonly actingSeat: Seat;
  readonly previousTotalContribution: number;
  readonly turnTimeMetric: TurnTimeMetric | null;
  readonly result: SubmitActionAcceptedResult;
};

export type SubmitActionChainDeps = {
  recordTurnTime(street: string, actionType: string, durationMs: number): void;
  recordAction(actionType: string): void;
  saveState(state: TableState): Promise<void>;
  publishTableState(table: Table, state: TableState): Promise<void>;
  recordActionContribution(params: {
    tableId: string;
    handId: string;
    action: SubmitActionAcceptedResult['action'];
    amount: number;
  }): Promise<
    | { readonly type: 'ok' }
    | { readonly type: 'unavailable'; readonly error: unknown }
    | { readonly type: 'error'; readonly error: string }
  >;
  warn(meta: unknown, message: string): void;
  eventEmitter: GameEventEmitter;
  clearTurnTimer(tableId: string): void;
  clearTurnStartMeta(tableId: string): void;
  handleHandEnded(table: Table, state: TableState): Promise<void>;
  startTurnTimer(table: Table, state: TableState): Promise<void>;
};

type SubmitActionHandler = AsyncChainHandler<SubmitActionChainContext, void>;

function recordMetrics(deps: SubmitActionChainDeps): SubmitActionHandler {
  return async (ctx, next) => {
    if (ctx.turnTimeMetric) {
      deps.recordTurnTime(
        ctx.turnTimeMetric.street,
        ctx.actionInput.type,
        ctx.turnTimeMetric.durationMs,
      );
    }

    deps.recordAction(ctx.actionInput.type);
    await next();
  };
}

function persistAndPublish(deps: SubmitActionChainDeps): SubmitActionHandler {
  return async (ctx, next) => {
    await deps.saveState(ctx.result.state);
    await deps.publishTableState(ctx.table, ctx.result.state);
    await next();
  };
}

function recordContributionIfNeeded(deps: SubmitActionChainDeps): SubmitActionHandler {
  return async (ctx, next) => {
    const hand = ctx.result.state.hand;
    if (!hand) {
      await next();
      return;
    }

    const seatId = ctx.actingSeat.seatId;
    const newTotalContribution = hand.totalContributions[seatId] ?? ctx.previousTotalContribution;
    const contributionDelta = Math.max(0, newTotalContribution - ctx.previousTotalContribution);
    if (contributionDelta <= 0) {
      await next();
      return;
    }

    fireAndForget(
      async () => {
        const contributionResult = await deps.recordActionContribution({
          tableId: ctx.tableId,
          handId: hand.handId,
          action: ctx.result.action,
          amount: contributionDelta,
        });

        if (contributionResult.type === 'unavailable') {
          deps.eventEmitter.emitDetached({
            tableId: ctx.tableId,
            handId: hand.handId,
            userId: ctx.userId,
            seatId,
            type: GameEventType.BALANCE_UNAVAILABLE,
            payload: { action: 'RECORD_CONTRIBUTION' },
          });
          return;
        }

        if (contributionResult.type === 'error') {
          deps.warn(
            {
              tableId: ctx.tableId,
              handId: hand.handId,
              error: contributionResult.error,
            },
            'balance.contribution.failed',
          );
        }
      },
      (error: unknown) => {
        deps.warn(
          { err: error, tableId: ctx.tableId, handId: hand.handId },
          'balance.contribution.failed',
        );
      },
    );

    await next();
  };
}

function emitActionTakenEvent(deps: SubmitActionChainDeps): SubmitActionHandler {
  return async (ctx, next) => {
    const hand = ctx.result.state.hand;

    const actedSeat = ctx.result.state.seats[ctx.actingSeat.seatId];
    const isAllIn = actedSeat?.status === 'ALL_IN' || ctx.result.action.type === 'ALL_IN';

    deps.eventEmitter.emitDetached({
      tableId: ctx.tableId,
      handId: hand?.handId,
      userId: ctx.userId,
      seatId: ctx.actingSeat.seatId,
      type: GameEventType.ACTION_TAKEN,
      payload: {
        seatId: ctx.actingSeat.seatId,
        action: ctx.result.action.type,
        amount: ctx.result.action.amount,
        isAllIn,
        street: ctx.actionStreet,
      },
      idempotencyKey: `event:${GameEventType.ACTION_TAKEN}:${ctx.result.action.actionId}`,
    });

    await next();
  };
}

function finalizeHandOrTimer(deps: SubmitActionChainDeps): SubmitActionHandler {
  return async (ctx, _next) => {
    const { result } = ctx;
    if (result.handComplete && result.state.hand) {
      deps.clearTurnTimer(ctx.tableId);
      deps.clearTurnStartMeta(ctx.tableId);
      await deps.handleHandEnded(ctx.table, result.state);
      return;
    }

    await deps.startTurnTimer(ctx.table, result.state);
  };
}

export function createSubmitActionChain(
  deps: SubmitActionChainDeps,
): (ctx: SubmitActionChainContext) => Promise<void> {
  return composeAsyncChain(
    [
      recordMetrics(deps),
      persistAndPublish(deps),
      recordContributionIfNeeded(deps),
      emitActionTakenEvent(deps),
      finalizeHandOrTimer(deps),
    ],
    async () => undefined,
  );
}
