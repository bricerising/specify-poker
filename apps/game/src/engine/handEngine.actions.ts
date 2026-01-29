import type { ActionInput, HandState, Seat } from '../domain/types';
import { getCallAmount } from './actionRules';

export type PlayerActionType = Exclude<ActionInput['type'], 'POST_BLIND'>;
export type PlayerActionInput = Exclude<ActionInput, { type: 'POST_BLIND'; amount: number }>;

export function isPlayerAction(action: ActionInput): action is PlayerActionInput {
  return action.type !== 'POST_BLIND';
}

export function readActionAmount(action: ActionInput): number | undefined {
  if ('amount' in action && typeof action.amount === 'number') {
    return action.amount;
  }
  return undefined;
}

function markAllInIfEmpty(seat: Seat): void {
  if (seat.stack === 0) {
    seat.status = 'ALL_IN';
  }
}

function applyCall(hand: HandState, seat: Seat, seatId: number): void {
  const toCall = getCallAmount(hand, seat);
  const amount = Math.min(toCall, seat.stack);
  seat.stack -= amount;
  hand.roundContributions[seatId] = (hand.roundContributions[seatId] ?? 0) + amount;
  hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + amount;
  markAllInIfEmpty(seat);
}

function applyBet(hand: HandState, seat: Seat, seatId: number, amount: number) {
  const betAmount = Math.min(amount, seat.stack);
  seat.stack -= betAmount;
  hand.currentBet = betAmount;
  hand.minRaise = betAmount;
  hand.raiseCapped = false;
  hand.roundContributions[seatId] = betAmount;
  hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + betAmount;
  hand.lastAggressor = seatId;
  markAllInIfEmpty(seat);
  return { resetActedSeats: true };
}

function applyRaise(
  hand: HandState,
  seat: Seat,
  seatId: number,
  amount: number,
  previousMinRaise: number,
) {
  const maxTotal = seat.stack + (hand.roundContributions[seatId] ?? 0);
  const raiseAmount = Math.min(amount, maxTotal);
  const raiseSize = raiseAmount - hand.currentBet;
  const additional = raiseAmount - (hand.roundContributions[seatId] ?? 0);
  seat.stack -= Math.max(0, additional);
  hand.currentBet = raiseAmount;
  if (raiseSize >= previousMinRaise) {
    hand.minRaise = raiseSize;
    hand.raiseCapped = false;
    hand.lastAggressor = seatId;
  } else {
    hand.raiseCapped = true;
  }
  hand.roundContributions[seatId] = raiseAmount;
  hand.totalContributions[seatId] =
    (hand.totalContributions[seatId] ?? 0) + Math.max(0, additional);
  markAllInIfEmpty(seat);
  return { resetActedSeats: raiseSize >= previousMinRaise };
}

function applyAllIn(hand: HandState, seat: Seat, seatId: number, previousMinRaise: number) {
  const maxTotal = seat.stack + (hand.roundContributions[seatId] ?? 0);
  if (maxTotal <= hand.currentBet) {
    applyCall(hand, seat, seatId);
    return { resetActedSeats: false };
  }
  const raiseSize = maxTotal - hand.currentBet;
  const additional = maxTotal - (hand.roundContributions[seatId] ?? 0);
  seat.stack -= Math.max(0, additional);
  hand.currentBet = maxTotal;
  if (raiseSize >= previousMinRaise) {
    hand.minRaise = raiseSize;
    hand.raiseCapped = false;
    hand.lastAggressor = seatId;
  } else {
    hand.raiseCapped = true;
  }
  hand.roundContributions[seatId] = maxTotal;
  hand.totalContributions[seatId] =
    (hand.totalContributions[seatId] ?? 0) + Math.max(0, additional);
  seat.status = 'ALL_IN';
  return { resetActedSeats: raiseSize >= previousMinRaise };
}

type PlayerActionHandler = (
  hand: HandState,
  seat: Seat,
  seatId: number,
  action: PlayerActionInput,
  ctx: { previousMinRaise: number },
) => { resetActedSeats: boolean };

const playerActionHandlers = {
  FOLD: (_hand: HandState, seat: Seat) => {
    seat.status = 'FOLDED';
    return { resetActedSeats: false };
  },
  CHECK: () => ({ resetActedSeats: false }),
  CALL: (hand: HandState, seat: Seat, seatId: number) => {
    applyCall(hand, seat, seatId);
    return { resetActedSeats: false };
  },
  BET: (hand: HandState, seat: Seat, seatId: number, action: PlayerActionInput) =>
    applyBet(hand, seat, seatId, readActionAmount(action) ?? 0),
  RAISE: (
    hand: HandState,
    seat: Seat,
    seatId: number,
    action: PlayerActionInput,
    ctx: { previousMinRaise: number },
  ) =>
    applyRaise(
      hand,
      seat,
      seatId,
      readActionAmount(action) ?? hand.currentBet,
      ctx.previousMinRaise,
    ),
  ALL_IN: (
    hand: HandState,
    seat: Seat,
    seatId: number,
    _action: PlayerActionInput,
    ctx: { previousMinRaise: number },
  ) => applyAllIn(hand, seat, seatId, ctx.previousMinRaise),
} satisfies Record<PlayerActionType, PlayerActionHandler>;

const ALLOWED_INACTIVE_ACTIONS: ReadonlySet<ActionInput['type']> = new Set(['FOLD', 'CHECK']);

export function canPerformInactiveAction(
  seat: Seat,
  action: ActionInput,
  allowInactive: boolean | undefined,
): boolean {
  return (
    allowInactive === true &&
    seat.status === 'DISCONNECTED' &&
    ALLOWED_INACTIVE_ACTIONS.has(action.type)
  );
}

export function normalizeActionInput(
  hand: HandState,
  seat: Seat,
  action: PlayerActionInput,
): PlayerActionInput {
  if (action.type !== 'ALL_IN') {
    return action;
  }

  const contributed = hand.roundContributions[seat.seatId] ?? 0;
  const amount = seat.stack + contributed;
  return { type: 'ALL_IN', amount };
}

export function applyPlayerAction(options: {
  hand: HandState;
  seat: Seat;
  seatId: number;
  action: PlayerActionInput;
  previousMinRaise: number;
}): { normalizedAction: PlayerActionInput; resetActedSeats: boolean } {
  const normalizedAction = normalizeActionInput(options.hand, options.seat, options.action);
  const update = playerActionHandlers[normalizedAction.type](
    options.hand,
    options.seat,
    options.seatId,
    normalizedAction,
    { previousMinRaise: options.previousMinRaise },
  );

  return {
    normalizedAction,
    resetActedSeats: update.resetActedSeats,
  };
}

