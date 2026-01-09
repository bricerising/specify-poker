export type ActionType = "Fold" | "Check" | "Call" | "Bet" | "Raise";

export interface TableSeat {
  seatId: number;
  userId: string | null;
  stack: number;
  status: string;
}

export interface HandState {
  currentBet: number;
  minRaise: number;
  currentTurnSeat: number;
  roundContributions: Record<number, number>;
  bigBlind: number;
}

export interface TableState {
  hand: HandState | null;
  seats: TableSeat[];
}

export interface LegalAction {
  type: ActionType;
  minAmount?: number;
  maxAmount?: number;
}

export function deriveLegalActions(table: TableState, seatId: number): LegalAction[] {
  const hand = table.hand;
  if (!hand) {
    return [];
  }
  const seat = table.seats.find((entry) => entry.seatId === seatId);
  if (!seat || seat.status !== "active") {
    return [];
  }
  if (hand.currentTurnSeat !== seatId) {
    return [];
  }

  const contributed = hand.roundContributions[seatId] ?? 0;
  const toCall = Math.max(0, hand.currentBet - contributed);
  const actions: LegalAction[] = [{ type: "Fold" }];

  if (toCall <= 0) {
    actions.push({ type: "Check" });
    if (hand.currentBet === 0) {
      actions.push({ type: "Bet", minAmount: hand.bigBlind, maxAmount: seat.stack });
    } else {
      const minRaise = hand.currentBet + hand.minRaise;
      if (seat.stack + contributed > minRaise) {
        actions.push({ type: "Raise", minAmount: minRaise, maxAmount: seat.stack + contributed });
      }
    }
  } else {
    actions.push({ type: "Call", maxAmount: Math.min(toCall, seat.stack) });
    const minRaise = hand.currentBet + hand.minRaise;
    if (seat.stack + contributed > minRaise) {
      actions.push({ type: "Raise", minAmount: minRaise, maxAmount: seat.stack + contributed });
    }
  }

  return actions;
}
