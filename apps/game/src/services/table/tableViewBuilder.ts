import type { HandState, Table, TableState } from '../../domain/types';

function redactSeatForBroadcast(seat: TableState['seats'][number]) {
  return {
    seatId: seat.seatId,
    userId: seat.userId,
    stack: seat.stack,
    status: seat.status,
    lastAction: seat.lastAction,
    holeCards: null,
  };
}

export function redactHandState(hand: HandState) {
  return {
    handId: hand.handId,
    tableId: hand.tableId,
    street: hand.street,
    communityCards: hand.communityCards,
    pots: hand.pots.map((pot) => ({
      ...pot,
      eligibleSeatIds: pot.eligibleSeats,
    })),
    currentBet: hand.currentBet,
    minRaise: hand.minRaise,
    turn: hand.turn,
    lastAggressor: hand.lastAggressor,
    actions: hand.actions,
    rakeAmount: hand.rakeAmount,
    startedAt: hand.startedAt,
    winners: hand.winners,
    endedAt: hand.endedAt ?? null,
  };
}

export function buildTableStateView(table: Table, state: TableState) {
  const hand = state.hand ? redactHandState(state.hand) : null;
  return {
    tableId: table.tableId,
    name: table.name,
    ownerId: table.ownerId,
    config: table.config,
    status: table.status,
    hand,
    version: state.version,
    seats: state.seats.map(redactSeatForBroadcast),
    spectators: state.spectators,
    updatedAt: state.updatedAt,
    button: state.button,
  };
}

export function redactTableState(state: TableState): TableState {
  return {
    ...state,
    seats: state.seats.map((seat) => ({ ...redactSeatForBroadcast(seat) })),
  };
}
