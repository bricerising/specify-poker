import type { ActionInput, ActionType, HandState, LegalAction, Seat } from '../domain/types';

type ValidationResult = { ok: true } | { ok: false; reason: ValidationReason };

type ValidationReason =
  | 'HAND_COMPLETE'
  | 'SEAT_INACTIVE'
  | 'ILLEGAL_ACTION'
  | 'MISSING_AMOUNT'
  | 'AMOUNT_TOO_SMALL'
  | 'AMOUNT_TOO_LARGE';

const AMOUNT_REQUIRED_ACTIONS: ReadonlySet<ActionType> = new Set(['BET', 'RAISE', 'ALL_IN']);

export function getCallAmount(hand: HandState, seat: Seat): number {
  const contributed = hand.roundContributions[seat.seatId] ?? 0;
  return Math.max(0, hand.currentBet - contributed);
}

export function deriveLegalActions(hand: HandState, seat: Seat): LegalAction[] {
  if (seat.status !== 'ACTIVE') {
    return [];
  }

  const actions: LegalAction[] = [];
  const toCall = getCallAmount(hand, seat);
  const canRaise = !hand.raiseCapped || !hand.actedSeats.includes(seat.seatId);

  actions.push({ type: 'FOLD' });

  const contributed = hand.roundContributions[seat.seatId] ?? 0;
  const maxTotal = seat.stack + contributed;

  if (toCall <= 0) {
    actions.push({ type: 'CHECK' });
    if (seat.stack > 0) {
      if (hand.currentBet === 0) {
        actions.push({ type: 'BET', minAmount: hand.minRaise, maxAmount: seat.stack });
      } else {
        if (canRaise && maxTotal > hand.currentBet) {
          const minRaise = Math.min(hand.currentBet + hand.minRaise, maxTotal);
          actions.push({
            type: 'RAISE',
            minAmount: minRaise,
            maxAmount: maxTotal,
          });
        }
      }
      actions.push({ type: 'ALL_IN', minAmount: maxTotal, maxAmount: maxTotal });
    }
  } else {
    actions.push({ type: 'CALL', maxAmount: Math.min(toCall, seat.stack) });
    if (canRaise && maxTotal > hand.currentBet) {
      const minRaise = Math.min(hand.currentBet + hand.minRaise, maxTotal);
      actions.push({
        type: 'RAISE',
        minAmount: minRaise,
        maxAmount: maxTotal,
      });
    }
    if (seat.stack > 0) {
      actions.push({ type: 'ALL_IN', minAmount: maxTotal, maxAmount: maxTotal });
    }
  }

  return actions;
}

function isValidAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && !Number.isNaN(amount);
}

function validateAmountBounds(action: ActionInput, legal: LegalAction): ValidationResult {
  if (!AMOUNT_REQUIRED_ACTIONS.has(action.type)) {
    return { ok: true };
  }

  if (!isValidAmount(action.amount)) {
    return { ok: false, reason: 'MISSING_AMOUNT' };
  }

  if (legal.minAmount !== undefined && action.amount < legal.minAmount) {
    return { ok: false, reason: 'AMOUNT_TOO_SMALL' };
  }

  if (legal.maxAmount !== undefined && action.amount > legal.maxAmount) {
    return { ok: false, reason: 'AMOUNT_TOO_LARGE' };
  }

  return { ok: true };
}

export function validateAction(hand: HandState, seat: Seat, action: ActionInput): ValidationResult {
  if (hand.street === 'SHOWDOWN') {
    return { ok: false, reason: 'HAND_COMPLETE' };
  }

  if (seat.status !== 'ACTIVE') {
    return { ok: false, reason: 'SEAT_INACTIVE' };
  }

  const legalActions = deriveLegalActions(hand, seat);
  const matchingAction = legalActions.find((entry) => entry.type === action.type);

  if (!matchingAction) {
    return { ok: false, reason: 'ILLEGAL_ACTION' };
  }

  return validateAmountBounds(action, matchingAction);
}
