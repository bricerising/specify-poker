import type { HandState, Seat } from '../domain/types';
import { advanceStreet, isBettingRoundComplete } from './handEngine.bettingRound';
import { nextActiveSeat } from './handEngine.seats';
import { endHandAtRiver, endHandByFold, endHandByShowdown } from './handEngine.settlement';

export type PostActionContext = {
  readonly hand: HandState;
  readonly seats: Seat[];
  readonly buttonSeat: number;
  readonly actingSeatId: number;
  readonly timestamp: string;
  readonly remainingSeats: Seat[];
  readonly activeSeats: Seat[];
};

type PostActionHandlerResult =
  | { readonly kind: 'pass' }
  | { readonly kind: 'handled'; readonly handComplete: boolean };

type PostActionHandler = (ctx: PostActionContext) => PostActionHandlerResult;

function pass(): PostActionHandlerResult {
  return { kind: 'pass' };
}

function handled(handComplete: boolean): PostActionHandlerResult {
  return { kind: 'handled', handComplete };
}

function handleEndHandByFold(ctx: PostActionContext): PostActionHandlerResult {
  if (ctx.remainingSeats.length !== 1) {
    return pass();
  }
  endHandByFold(ctx.hand, ctx.seats, ctx.buttonSeat, ctx.timestamp);
  return handled(true);
}

function handleEndHandByShowdown(ctx: PostActionContext): PostActionHandlerResult {
  const shouldShowdown =
    ctx.activeSeats.length === 0 || (ctx.activeSeats.length === 1 && ctx.remainingSeats.length > 1);
  if (!shouldShowdown) {
    return pass();
  }
  endHandByShowdown(ctx.hand, ctx.seats, ctx.buttonSeat, ctx.timestamp);
  return handled(true);
}

function handleContinueBettingRound(ctx: PostActionContext): PostActionHandlerResult {
  const roundComplete = isBettingRoundComplete(ctx.hand, ctx.seats);
  if (roundComplete) {
    return pass();
  }

  ctx.hand.turn = nextActiveSeat(ctx.seats, ctx.actingSeatId);
  return handled(false);
}

function handleEndHandAtRiver(ctx: PostActionContext): PostActionHandlerResult {
  if (ctx.hand.street !== 'RIVER') {
    return pass();
  }
  endHandAtRiver(ctx.hand, ctx.seats, ctx.buttonSeat, ctx.timestamp);
  return handled(true);
}

function handleAdvanceStreet(ctx: PostActionContext): PostActionHandlerResult {
  advanceStreet(ctx.hand, ctx.seats, ctx.buttonSeat);
  return handled(false);
}

const postActionHandlers: readonly PostActionHandler[] = [
  handleEndHandByFold,
  handleEndHandByShowdown,
  handleContinueBettingRound,
  handleEndHandAtRiver,
  handleAdvanceStreet,
];

export function resolvePostAction(ctx: PostActionContext): { readonly handComplete: boolean } {
  for (const handler of postActionHandlers) {
    const result = handler(ctx);
    if (result.kind === 'handled') {
      return result;
    }
  }
  return { handComplete: false };
}

