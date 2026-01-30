import { randomUUID } from 'crypto';

import { seatAt } from '../domain/seats';
import type { Action, ActionInput, Card, HandState, Seat, TableConfig, TableState } from '../domain/types';
import { validateAction, type ValidationReason } from './actionRules';
import { calculatePots } from './potCalculator';
import {
  applyPlayerAction,
  canPerformInactiveAction,
  isPlayerAction,
  readActionAmount,
} from './handEngine.actions';
import { dealCards, createDeck, seededShuffle } from './handEngine.deck';
import {
  activeSeats,
  activeSeatsRemaining,
  findEligibleSeats,
  getFoldedSeatIds,
  nextActiveSeat,
  nextEligibleSeat,
  resetRoundContributions,
} from './handEngine.seats';
import { resolvePostAction } from './handEngine.postAction';

// ============================================================================
// Result Types (Discriminated Unions)
// ============================================================================

type EngineActionRejectionReason = 'NO_HAND' | 'NOT_YOUR_TURN' | 'SEAT_MISSING' | 'SEAT_INACTIVE';

export type ApplyActionRejectionReason = EngineActionRejectionReason | ValidationReason;

export type ApplyActionResult =
  | {
      accepted: false;
      state: TableState;
      reason: ApplyActionRejectionReason;
    }
  | {
      accepted: true;
      state: TableState;
      action: Action;
      handComplete: boolean;
    };

function rejectAction(
  tableState: TableState,
  reason: ApplyActionRejectionReason,
): ApplyActionResult {
  return { accepted: false, state: tableState, reason };
}

function acceptAction(
  tableState: TableState,
  action: Action,
  timestamp: string,
  handComplete: boolean,
): ApplyActionResult {
  return {
    accepted: true,
    state: { ...tableState, version: tableState.version + 1, updatedAt: timestamp },
    action,
    handComplete,
  };
}

// ============================================================================
// Exported Functions
// ============================================================================

function createAction(handId: string, seat: Seat, input: ActionInput, timestamp: string): Action {
  return {
    actionId: randomUUID(),
    handId,
    seatId: seat.seatId,
    userId: seat.userId ?? '',
    type: input.type,
    amount: readActionAmount(input) ?? 0,
    timestamp,
  };
}

export function startHand(
  tableState: TableState,
  config: TableConfig,
  options: { deck?: Card[]; now?: () => string } = {},
): TableState {
  const now = options.now ?? (() => new Date().toISOString());
  const eligible = findEligibleSeats(tableState.seats);
  if (eligible.length < 2) {
    return tableState;
  }
  const startedAt = now();

  const sortedSeats = eligible.map((seat) => seat.seatId).sort((a, b) => a - b);
  const previousButton = tableState.button;
  const buttonSeat =
    typeof previousButton === 'number'
      ? nextEligibleSeat(tableState.seats, previousButton)
      : sortedSeats[0];
  const smallBlindSeat =
    eligible.length === 2 ? buttonSeat : nextEligibleSeat(tableState.seats, buttonSeat);
  const bigBlindSeat = nextEligibleSeat(tableState.seats, smallBlindSeat);

  const deck = options.deck ?? seededShuffle(createDeck(), `${tableState.tableId}:${startedAt}`);
  for (const seat of eligible) {
    seat.holeCards = dealCards(deck, 2);
    seat.status = 'ACTIVE';
  }

  const roundContributions = resetRoundContributions(tableState.seats);
  const totalContributions = resetRoundContributions(tableState.seats);
  const actions: Action[] = [];

  if (config.ante && config.ante > 0) {
    for (const seat of eligible) {
      const ante = Math.min(config.ante, seat.stack);
      seat.stack -= ante;
      roundContributions[seat.seatId] += ante;
      totalContributions[seat.seatId] += ante;
      if (ante > 0) {
        actions.push(
          createAction('pending', seat, { type: 'POST_BLIND', amount: ante }, startedAt),
        );
      }
      if (seat.stack === 0) {
        seat.status = 'ALL_IN';
      }
    }
  }

  const smallBlindAmount = Math.min(config.smallBlind, tableState.seats[smallBlindSeat].stack);
  const bigBlindAmount = Math.min(config.bigBlind, tableState.seats[bigBlindSeat].stack);

  tableState.seats[smallBlindSeat].stack -= smallBlindAmount;
  tableState.seats[bigBlindSeat].stack -= bigBlindAmount;

  roundContributions[smallBlindSeat] += smallBlindAmount;
  roundContributions[bigBlindSeat] += bigBlindAmount;
  totalContributions[smallBlindSeat] += smallBlindAmount;
  totalContributions[bigBlindSeat] += bigBlindAmount;

  if (smallBlindAmount > 0) {
    actions.push(
      createAction(
        'pending',
        tableState.seats[smallBlindSeat],
        { type: 'POST_BLIND', amount: smallBlindAmount },
        startedAt,
      ),
    );
  }
  if (bigBlindAmount > 0) {
    actions.push(
      createAction(
        'pending',
        tableState.seats[bigBlindSeat],
        { type: 'POST_BLIND', amount: bigBlindAmount },
        startedAt,
      ),
    );
  }

  if (tableState.seats[smallBlindSeat].stack === 0) {
    tableState.seats[smallBlindSeat].status = 'ALL_IN';
  }
  if (tableState.seats[bigBlindSeat].stack === 0) {
    tableState.seats[bigBlindSeat].status = 'ALL_IN';
  }

  const handId = randomUUID();
  const finalizedActions = actions.map((action) => ({ ...action, handId }));

  const hand: HandState = {
    handId,
    tableId: tableState.tableId,
    street: 'PREFLOP',
    communityCards: [],
    pots: [],
    currentBet: bigBlindAmount,
    minRaise: config.bigBlind,
    bigBlind: config.bigBlind,
    turn: nextActiveSeat(tableState.seats, bigBlindSeat),
    lastAggressor: bigBlindSeat,
    actions: finalizedActions,
    rakeAmount: 0,
    startedAt,
    deck,
    roundContributions,
    totalContributions,
    actedSeats: [],
    raiseCapped: false,
  };

  hand.pots = calculatePots(hand.totalContributions, getFoldedSeatIds(tableState.seats));

  return {
    ...tableState,
    button: buttonSeat,
    hand,
    version: tableState.version + 1,
    updatedAt: startedAt,
  };
}

export function applyAction(
  tableState: TableState,
  seatId: number,
  action: ActionInput,
  options: { now?: () => string; allowInactive?: boolean } = {},
): ApplyActionResult {
  const hand = tableState.hand;
  if (!hand) {
    return rejectAction(tableState, 'NO_HAND');
  }

  if (hand.turn !== seatId) {
    return rejectAction(tableState, 'NOT_YOUR_TURN');
  }

  const seat = seatAt(tableState.seats, seatId);
  if (!seat) {
    return rejectAction(tableState, 'SEAT_MISSING');
  }

  const allowInactiveAction = canPerformInactiveAction(seat, action, options.allowInactive);
  if (seat.status !== 'ACTIVE' && !allowInactiveAction) {
    return rejectAction(tableState, 'SEAT_INACTIVE');
  }

  const validationSeat = allowInactiveAction ? { ...seat, status: 'ACTIVE' as const } : seat;
  const validation = validateAction(hand, validationSeat, action);
  if (!validation.ok) {
    return rejectAction(tableState, validation.reason);
  }

  const now = options.now ?? (() => new Date().toISOString());
  const timestamp = now();
  const previousMinRaise = hand.minRaise;
  if (!isPlayerAction(action)) {
    return rejectAction(tableState, 'ILLEGAL_ACTION');
  }

  const { normalizedAction, resetActedSeats } = applyPlayerAction({
    hand,
    seat,
    seatId,
    action,
    previousMinRaise,
  });

  const actionRecord = createAction(hand.handId, seat, normalizedAction, timestamp);
  hand.actions.push(actionRecord);
  seat.lastAction = actionRecord.timestamp;

  hand.pots = calculatePots(hand.totalContributions, getFoldedSeatIds(tableState.seats));
  if (resetActedSeats) {
    hand.actedSeats = [seatId];
  } else if (!hand.actedSeats.includes(seatId)) {
    hand.actedSeats.push(seatId);
  }

  const remaining = activeSeatsRemaining(tableState.seats);
  const active = activeSeats(tableState.seats);

  const seats = tableState.seats;
  const buttonSeat = tableState.button;

  const postAction = resolvePostAction({
    hand,
    seats,
    buttonSeat,
    actingSeatId: seatId,
    timestamp,
    remainingSeats: remaining,
    activeSeats: active,
  });

  return acceptAction(tableState, actionRecord, timestamp, postAction.handComplete);
}
