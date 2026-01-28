import { randomUUID } from 'crypto';

import { seatAt } from '../domain/seats';
import type {
  Action,
  ActionInput,
  Card,
  HandState,
  HandStreet,
  Seat,
  TableConfig,
  TableState,
} from '../domain/types';
import { getCallAmount, validateAction, type ValidationReason } from './actionRules';
import { evaluateWinners } from './rankings';
import { calculatePots, calculateRake } from './potCalculator';
import { calculatePotPayouts } from './potSettlement';

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
// Constants
// ============================================================================

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
const MAX_RAKE = 5;

// ============================================================================
// Street Progression
// ============================================================================

const STREET_PROGRESSION: Readonly<Record<HandStreet, HandStreet>> = {
  PREFLOP: 'FLOP',
  FLOP: 'TURN',
  TURN: 'RIVER',
  RIVER: 'SHOWDOWN',
  SHOWDOWN: 'SHOWDOWN',
};

const COMMUNITY_CARDS_TO_DEAL: Readonly<Record<HandStreet, number>> = {
  PREFLOP: 3,
  FLOP: 1,
  TURN: 1,
  RIVER: 0,
  SHOWDOWN: 0,
};

// ============================================================================
// Deck & Shuffle
// ============================================================================

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededShuffle(deck: Card[], seed: string): Card[] {
  const result = [...deck];
  let state = hashSeed(seed) || 1;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (state * 48271) % 2147483647;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// Seat Navigation
// ============================================================================

function nextActiveSeat(seats: Seat[], startSeat: number): number {
  const total = seats.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const seatId = (startSeat + offset) % total;
    if (seats[seatId]?.status === 'ACTIVE') {
      return seatId;
    }
  }
  return startSeat;
}

function nextEligibleSeat(seats: Seat[], startSeat: number): number {
  const total = seats.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const seatId = (startSeat + offset) % total;
    if (seats[seatId]?.status === 'SEATED') {
      return seatId;
    }
  }
  return startSeat;
}

function findEligibleSeats(seats: Seat[]): Seat[] {
  return seats.filter((seat) => seat.userId && seat.status === 'SEATED' && seat.stack > 0);
}

// ============================================================================
// Contributions & Cards
// ============================================================================

function resetRoundContributions(seats: Seat[]): Record<number, number> {
  const contributions: Record<number, number> = {};
  for (const seat of seats) {
    contributions[seat.seatId] = 0;
  }
  return contributions;
}

function dealCards(deck: Card[], count: number): Card[] {
  return deck.splice(0, count);
}

function getFoldedSeatIds(seats: Seat[]): Set<number> {
  return new Set(seats.filter((seat) => seat.status === 'FOLDED').map((seat) => seat.seatId));
}

// ============================================================================
// Seat State Queries
// ============================================================================

function activeSeatsRemaining(seats: Seat[]): Seat[] {
  return seats.filter((seat) => seat.status === 'ACTIVE' || seat.status === 'ALL_IN');
}

function activeSeats(seats: Seat[]): Seat[] {
  return seats.filter((seat) => seat.status === 'ACTIVE');
}

function resetHandSeats(seats: Seat[]): void {
  for (const seat of seats) {
    if (seat.userId) {
      if (seat.status === 'ACTIVE' || seat.status === 'FOLDED' || seat.status === 'ALL_IN') {
        seat.status = 'SEATED';
      }
    } else if (seat.status !== 'EMPTY') {
      seat.status = 'EMPTY';
    }
    seat.holeCards = null;
  }
}

function dealRemainingCommunityCards(hand: HandState): void {
  if (hand.communityCards.length < 3) {
    hand.communityCards.push(...dealCards(hand.deck, 3 - hand.communityCards.length)); // Flop (or remainder)
  }
  if (hand.communityCards.length === 3) {
    hand.communityCards.push(...dealCards(hand.deck, 1)); // Turn
  }
  if (hand.communityCards.length === 4) {
    hand.communityCards.push(...dealCards(hand.deck, 1)); // River
  }
}

// ============================================================================
// Betting Round Logic
// ============================================================================

function isBettingRoundComplete(hand: HandState, seats: Seat[]): boolean {
  if (hand.currentBet === 0) {
    for (const seat of seats) {
      if (seat.status !== 'ACTIVE') {
        continue;
      }
      if (!hand.actedSeats.includes(seat.seatId)) {
        return false;
      }
    }
    return true;
  }
  for (const seat of seats) {
    if (seat.status !== 'ACTIVE') {
      continue;
    }
    const contribution = hand.roundContributions[seat.seatId] ?? 0;
    if (contribution < hand.currentBet) {
      return false;
    }
  }
  return true;
}

function advanceStreet(hand: HandState, seats: Seat[], buttonSeat: number): HandState {
  const nextStreet = STREET_PROGRESSION[hand.street];
  if (nextStreet === 'SHOWDOWN') {
    hand.street = 'SHOWDOWN';
    return hand;
  }

  const cardsToDeal = COMMUNITY_CARDS_TO_DEAL[hand.street];
  if (cardsToDeal > 0) {
    hand.communityCards.push(...dealCards(hand.deck, cardsToDeal));
  }

  hand.street = nextStreet;
  hand.roundContributions = resetRoundContributions(seats);
  hand.currentBet = 0;
  hand.minRaise = hand.bigBlind;
  hand.raiseCapped = false;
  hand.turn = nextActiveSeat(seats, buttonSeat);
  hand.actedSeats = [];

  return hand;
}

// ============================================================================
// Settlement
// ============================================================================

function settleWinners(
  hand: HandState,
  seats: Seat[],
  buttonSeat: number,
  potWinners?: Record<number, number[]>,
): void {
  const winnersSet = new Set<number>();
  let remainingRake = MAX_RAKE;

  for (let i = 0; i < hand.pots.length; i += 1) {
    const pot = hand.pots[i];
    if (pot.amount <= 0 || pot.eligibleSeats.length === 0) {
      continue;
    }

    const currentPotWinners = potWinners ? potWinners[i] : pot.eligibleSeats;
    if (!currentPotWinners || currentPotWinners.length === 0) {
      continue;
    }

    for (const winner of currentPotWinners) {
      winnersSet.add(winner);
    }
    pot.winners = currentPotWinners;

    let amountToDistribute = pot.amount;
    if (pot.eligibleSeats.length > 1 && remainingRake > 0) {
      const rake = calculateRake(amountToDistribute, remainingRake);
      amountToDistribute -= rake;
      remainingRake -= rake;
      hand.rakeAmount += rake;
      pot.amount = amountToDistribute;
    }
    const payouts = calculatePotPayouts({
      amount: amountToDistribute,
      winnerSeatIds: currentPotWinners,
      buttonSeat,
      seatCount: seats.length,
    });

    for (const payout of payouts) {
      const seat = seatAt(seats, payout.seatId);
      if (seat) {
        seat.stack += payout.amount;
      }
    }
  }

  hand.winners = Array.from(winnersSet);
}

function settleShowdown(hand: HandState, seats: Seat[], buttonSeat: number): void {
  const potWinnersMap: Record<number, number[]> = {};

  for (let i = 0; i < hand.pots.length; i += 1) {
    const pot = hand.pots[i];
    if (pot.amount <= 0 || pot.eligibleSeats.length === 0) {
      continue;
    }

    const potPlayers: Record<number, Card[]> = {};
    for (const seatId of pot.eligibleSeats) {
      const seat = seatAt(seats, seatId);
      if (seat?.holeCards) {
        potPlayers[seatId] = seat.holeCards;
      }
    }
    const { winners } = evaluateWinners(potPlayers, hand.communityCards);
    potWinnersMap[i] = winners;
  }

  settleWinners(hand, seats, buttonSeat, potWinnersMap);
}

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

// ============================================================================
// Action Handlers
// ============================================================================

function readActionAmount(action: ActionInput): number | undefined {
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

type PlayerActionType = Exclude<ActionInput['type'], 'POST_BLIND'>;

type PlayerActionHandler = (
  hand: HandState,
  seat: Seat,
  seatId: number,
  action: ActionInput,
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
  BET: (hand: HandState, seat: Seat, seatId: number, action: ActionInput) =>
    applyBet(hand, seat, seatId, readActionAmount(action) ?? 0),
  RAISE: (
    hand: HandState,
    seat: Seat,
    seatId: number,
    action: ActionInput,
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
    _action: ActionInput,
    ctx: { previousMinRaise: number },
  ) => applyAllIn(hand, seat, seatId, ctx.previousMinRaise),
} satisfies Record<PlayerActionType, PlayerActionHandler>;

const ALLOWED_INACTIVE_ACTIONS: ReadonlySet<ActionInput['type']> = new Set(['FOLD', 'CHECK']);

function isPlayerActionType(type: ActionInput['type']): type is PlayerActionType {
  return type !== 'POST_BLIND';
}

function canPerformInactiveAction(
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

function normalizeActionInput(hand: HandState, seat: Seat, action: ActionInput): ActionInput {
  if (action.type !== 'ALL_IN') {
    return action;
  }

  const contributed = hand.roundContributions[seat.seatId] ?? 0;
  const amount = seat.stack + contributed;
  return { type: 'ALL_IN', amount };
}

// ============================================================================
// Hand Ending
// ============================================================================

function endHandByFold(hand: HandState, seats: Seat[], buttonSeat: number, endedAt: string): void {
  settleWinners(hand, seats, buttonSeat);
  resetHandSeats(seats);
  hand.endedAt = endedAt;
}

function endHandByShowdown(
  hand: HandState,
  seats: Seat[],
  buttonSeat: number,
  endedAt: string,
): void {
  dealRemainingCommunityCards(hand);
  hand.street = 'SHOWDOWN';
  settleShowdown(hand, seats, buttonSeat);
  resetHandSeats(seats);
  hand.endedAt = endedAt;
}

function endHandAtRiver(hand: HandState, seats: Seat[], buttonSeat: number, endedAt: string): void {
  settleShowdown(hand, seats, buttonSeat);
  resetHandSeats(seats);
  hand.endedAt = endedAt;
}

// ============================================================================
// Post-Action Resolution (Chain of Responsibility)
// ============================================================================

type PostActionContext = {
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

function resolvePostAction(ctx: PostActionContext): { readonly handComplete: boolean } {
  for (const handler of postActionHandlers) {
    const result = handler(ctx);
    if (result.kind === 'handled') {
      return result;
    }
  }
  return { handComplete: false };
}

// ============================================================================
// Exported Functions
// ============================================================================

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
  if (!isPlayerActionType(action.type)) {
    return rejectAction(tableState, 'ILLEGAL_ACTION');
  }

  const normalizedAction = normalizeActionInput(hand, seat, action);
  const update = playerActionHandlers[action.type](hand, seat, seatId, normalizedAction, {
    previousMinRaise,
  });
  const resetActedSeats = update.resetActedSeats;

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
