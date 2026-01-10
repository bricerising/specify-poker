import { HandActionInput, HandActionType, HandState, Pot, TableSeat } from "./types";

export interface LegalAction {
  type: HandActionType;
  minAmount?: number;
  maxAmount?: number;
}

export function getCallAmount(hand: HandState, seat: TableSeat) {
  const contributed = hand.roundContributions[seat.seatId] ?? 0;
  return Math.max(0, hand.currentBet - contributed);
}

export function deriveLegalActions(hand: HandState, seat: TableSeat): LegalAction[] {
  if (seat.status !== "active") {
    return [];
  }

  const actions: LegalAction[] = [];
  const toCall = getCallAmount(hand, seat);
  const canRaise = !hand.raiseCapped || !hand.actedSeats.includes(seat.seatId);

  actions.push({ type: "Fold" });

  if (toCall <= 0) {
    actions.push({ type: "Check" });
    if (seat.stack > 0) {
      if (hand.currentBet === 0) {
        actions.push({ type: "Bet", minAmount: hand.bigBlind, maxAmount: seat.stack });
      } else {
        const contributed = hand.roundContributions[seat.seatId] ?? 0;
        const maxTotal = seat.stack + contributed;
        if (canRaise && maxTotal > hand.currentBet) {
          const minRaise = Math.min(hand.currentBet + hand.minRaise, maxTotal);
          actions.push({
            type: "Raise",
            minAmount: minRaise,
            maxAmount: maxTotal,
          });
        }
      }
    }
  } else {
    actions.push({ type: "Call", maxAmount: Math.min(toCall, seat.stack) });
    const contributed = hand.roundContributions[seat.seatId] ?? 0;
    const maxTotal = seat.stack + contributed;
    if (canRaise && maxTotal > hand.currentBet) {
      const minRaise = Math.min(hand.currentBet + hand.minRaise, maxTotal);
      actions.push({
        type: "Raise",
        minAmount: minRaise,
        maxAmount: maxTotal,
      });
    }
  }

  return actions;
}

export function validateAction(
  hand: HandState,
  seat: TableSeat,
  action: HandActionInput,
): { ok: boolean; reason?: string } {
  if (hand.currentStreet === "ended" || hand.currentStreet === "showdown") {
    return { ok: false, reason: "hand_complete" };
  }

  if (seat.status !== "active") {
    return { ok: false, reason: "seat_inactive" };
  }

  const legal = deriveLegalActions(hand, seat).find((entry) => entry.type === action.type);
  if (!legal) {
    return { ok: false, reason: "illegal_action" };
  }

  if (action.type === "Bet" || action.type === "Raise") {
    if (typeof action.amount !== "number" || Number.isNaN(action.amount)) {
      return { ok: false, reason: "missing_amount" };
    }
    if (legal.minAmount && action.amount < legal.minAmount) {
      return { ok: false, reason: "amount_too_small" };
    }
    if (legal.maxAmount && action.amount > legal.maxAmount) {
      return { ok: false, reason: "amount_too_large" };
    }
  }

  return { ok: true };
}

export function calculatePots(
  contributions: Record<number, number>,
  foldedSeatIds: Set<number>,
): Pot[] {
  const entries = Object.entries(contributions)
    .filter(([, amount]) => amount > 0)
    .map(([seatId, amount]) => ({ seatId: Number(seatId), amount }))
    .sort((a, b) => a.amount - b.amount);

  if (entries.length === 0) {
    return [];
  }

  const pots: Pot[] = [];
  let remaining = [...entries];
  let previous = 0;

  for (const entry of entries) {
    const level = entry.amount - previous;
    if (level > 0) {
      const amount = level * remaining.length;
      const eligibleSeatIds = remaining
        .map((seat) => seat.seatId)
        .filter((seatId) => !foldedSeatIds.has(seatId));
      pots.push({ amount, eligibleSeatIds });
      previous = entry.amount;
    }
    remaining = remaining.filter((seat) => seat.seatId !== entry.seatId);
  }

  return pots;
}
