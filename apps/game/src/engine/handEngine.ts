import { randomUUID } from "crypto";

import {
  Action,
  ActionInput,
  Card,
  HandState,
  HandStreet,
  Seat,
  TableConfig,
  TableState,
} from "../domain/types";
import { getCallAmount, validateAction } from "./actionRules";
import { evaluateWinners } from "./rankings";
import { calculatePots, calculateRake } from "./potCalculator";

function createDeck(): Card[] {
  const suits = ["hearts", "diamonds", "clubs", "spades"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
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

function seededShuffle(deck: Card[], seed: string) {
  const result = [...deck];
  let state = hashSeed(seed) || 1;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (state * 48271) % 2147483647;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function nextActiveSeat(seats: Seat[], startSeat: number) {
  const total = seats.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const seat = seats[(startSeat + offset) % total];
    if (seat.status === "ACTIVE") {
      return seat.seatId;
    }
  }
  return startSeat;
}

function nextEligibleSeat(seats: Seat[], startSeat: number) {
  const total = seats.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const seat = seats[(startSeat + offset) % total];
    if (seat.status === "SEATED") {
      return seat.seatId;
    }
  }
  return startSeat;
}

function findEligibleSeats(seats: Seat[]) {
  return seats.filter((seat) => seat.userId && seat.status === "SEATED" && seat.stack > 0);
}

function resetRoundContributions(seats: Seat[]) {
  const contributions: Record<number, number> = {};
  for (const seat of seats) {
    contributions[seat.seatId] = 0;
  }
  return contributions;
}

function dealCards(deck: Card[], count: number) {
  return deck.splice(0, count);
}

function getFoldedSeatIds(seats: Seat[]) {
  return new Set(seats.filter((seat) => seat.status === "FOLDED").map((seat) => seat.seatId));
}

function activeSeatsRemaining(seats: Seat[]) {
  return seats.filter((seat) => seat.status === "ACTIVE" || seat.status === "ALL_IN");
}

function activeSeats(seats: Seat[]) {
  return seats.filter((seat) => seat.status === "ACTIVE");
}

function resetHandSeats(seats: Seat[]) {
  for (const seat of seats) {
    if (seat.userId) {
      if (seat.status === "ACTIVE" || seat.status === "FOLDED" || seat.status === "ALL_IN") {
        seat.status = "SEATED";
      }
    } else if (seat.status !== "EMPTY") {
      seat.status = "EMPTY";
    }
    seat.holeCards = null;
  }
}

function dealRemainingCommunityCards(hand: HandState) {
  if (hand.communityCards.length === 0) {
    hand.communityCards.push(...dealCards(hand.deck, 3));
  }
  if (hand.communityCards.length === 3) {
    hand.communityCards.push(...dealCards(hand.deck, 1));
  }
  if (hand.communityCards.length === 4) {
    hand.communityCards.push(...dealCards(hand.deck, 1));
  }
}

function isBettingRoundComplete(hand: HandState, seats: Seat[]) {
  if (hand.currentBet === 0) {
    for (const seat of seats) {
      if (seat.status !== "ACTIVE") {
        continue;
      }
      if (!hand.actedSeats.includes(seat.seatId)) {
        return false;
      }
    }
    return true;
  }
  for (const seat of seats) {
    if (seat.status !== "ACTIVE") {
      continue;
    }
    const contribution = hand.roundContributions[seat.seatId] ?? 0;
    if (contribution < hand.currentBet) {
      return false;
    }
  }
  return true;
}

function advanceStreet(hand: HandState, seats: Seat[], buttonSeat: number) {
  const nextStreetMap: Record<HandStreet, HandStreet> = {
    PREFLOP: "FLOP",
    FLOP: "TURN",
    TURN: "RIVER",
    RIVER: "SHOWDOWN",
    SHOWDOWN: "SHOWDOWN",
  };

  const nextStreet = nextStreetMap[hand.street];
  if (nextStreet === "SHOWDOWN") {
    hand.street = "SHOWDOWN";
    return hand;
  }

  if (hand.street === "PREFLOP") {
    hand.communityCards.push(...dealCards(hand.deck, 3));
  } else if (hand.street === "FLOP" || hand.street === "TURN") {
    hand.communityCards.push(...dealCards(hand.deck, 1));
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

function settleWinners(
  hand: HandState,
  seats: Seat[],
  buttonSeat: number,
  potWinners?: Record<number, number[]>,
) {
  const winnersSet = new Set<number>();
  let remainingRake = 5;

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

    const sortedWinners = [...currentPotWinners].sort((a, b) => {
      const distA = (a - buttonSeat + seats.length) % seats.length;
      const distB = (b - buttonSeat + seats.length) % seats.length;
      return distA - distB;
    });

    const share = Math.floor(amountToDistribute / sortedWinners.length);
    let remainder = amountToDistribute - share * sortedWinners.length;

    for (const winnerSeatId of sortedWinners) {
      const seat = seats.find((entry) => entry.seatId === winnerSeatId);
      if (seat) {
        seat.stack += share + (remainder > 0 ? 1 : 0);
        remainder = Math.max(0, remainder - 1);
      }
    }
  }

  hand.winners = Array.from(winnersSet);
}

function settleShowdown(hand: HandState, seats: Seat[], buttonSeat: number) {
  const potWinnersMap: Record<number, number[]> = {};

  for (let i = 0; i < hand.pots.length; i += 1) {
    const pot = hand.pots[i];
    if (pot.amount <= 0 || pot.eligibleSeats.length === 0) {
      continue;
    }

    const potPlayers: Record<number, Card[]> = {};
    for (const seatId of pot.eligibleSeats) {
      const seat = seats.find((entry) => entry.seatId === seatId);
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
    userId: seat.userId ?? "",
    type: input.type,
    amount: input.amount ?? 0,
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

  const sortedSeats = eligible.map((seat) => seat.seatId).sort((a, b) => a - b);
  const previousButton = tableState.button;
  const buttonSeat =
    typeof previousButton === "number"
      ? nextEligibleSeat(tableState.seats, previousButton)
      : sortedSeats[0];
  const smallBlindSeat =
    eligible.length === 2 ? buttonSeat : nextEligibleSeat(tableState.seats, buttonSeat);
  const bigBlindSeat = nextEligibleSeat(tableState.seats, smallBlindSeat);

  const deck = options.deck ?? seededShuffle(createDeck(), `${tableState.tableId}:${now()}`);
  for (const seat of eligible) {
    seat.holeCards = dealCards(deck, 2);
    seat.status = "ACTIVE";
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
          createAction(
            "pending",
            seat,
            { type: "POST_BLIND", amount: ante },
            now(),
          ),
        );
      }
      if (seat.stack === 0) {
        seat.status = "ALL_IN";
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
        "pending",
        tableState.seats[smallBlindSeat],
        { type: "POST_BLIND", amount: smallBlindAmount },
        now(),
      ),
    );
  }
  if (bigBlindAmount > 0) {
    actions.push(
      createAction(
        "pending",
        tableState.seats[bigBlindSeat],
        { type: "POST_BLIND", amount: bigBlindAmount },
        now(),
      ),
    );
  }

  if (tableState.seats[smallBlindSeat].stack === 0) {
    tableState.seats[smallBlindSeat].status = "ALL_IN";
  }
  if (tableState.seats[bigBlindSeat].stack === 0) {
    tableState.seats[bigBlindSeat].status = "ALL_IN";
  }

  const handId = randomUUID();
  const finalizedActions = actions.map((action) => ({ ...action, handId }));

  const hand: HandState = {
    handId,
    tableId: tableState.tableId,
    street: "PREFLOP",
    communityCards: [],
    pots: [],
    currentBet: bigBlindAmount,
    minRaise: config.bigBlind,
    bigBlind: config.bigBlind,
    turn: nextActiveSeat(tableState.seats, bigBlindSeat),
    lastAggressor: bigBlindSeat,
    actions: finalizedActions,
    rakeAmount: 0,
    startedAt: now(),
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
    updatedAt: now(),
  };
}

export function applyAction(
  tableState: TableState,
  seatId: number,
  action: ActionInput,
  options: { now?: () => string; allowInactive?: boolean } = {},
) {
  const hand = tableState.hand;
  if (!hand) {
    return { state: tableState, accepted: false, reason: "NO_HAND" };
  }

  if (hand.turn !== seatId) {
    return { state: tableState, accepted: false, reason: "NOT_YOUR_TURN" };
  }

  const seat = tableState.seats.find((entry) => entry.seatId === seatId);
  if (!seat) {
    return { state: tableState, accepted: false, reason: "SEAT_MISSING" };
  }

  if (
    seat.status !== "ACTIVE" &&
    !(options.allowInactive && seat.status === "DISCONNECTED" && (action.type === "FOLD" || action.type === "CHECK"))
  ) {
    return { state: tableState, accepted: false, reason: "SEAT_INACTIVE" };
  }

  const validationSeat = options.allowInactive && seat.status === "DISCONNECTED"
    ? { ...seat, status: "ACTIVE" as const }
    : seat;
  const validation = validateAction(hand, validationSeat, action);
  if (!validation.ok) {
    return { state: tableState, accepted: false, reason: validation.reason };
  }

  const now = options.now ?? (() => new Date().toISOString());
  const previousMinRaise = hand.minRaise;
  let resetActedSeats = false;

  if (action.type === "FOLD") {
    seat.status = "FOLDED";
  } else if (action.type === "CHECK") {
    // no-op
  } else if (action.type === "CALL") {
    const toCall = getCallAmount(hand, seat);
    const amount = Math.min(toCall, seat.stack);
    seat.stack -= amount;
    hand.roundContributions[seatId] = (hand.roundContributions[seatId] ?? 0) + amount;
    hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + amount;
    if (seat.stack === 0) {
      seat.status = "ALL_IN";
    }
  } else if (action.type === "BET") {
    const amount = Math.min(action.amount ?? 0, seat.stack);
    seat.stack -= amount;
    hand.currentBet = amount;
    hand.minRaise = amount;
    hand.raiseCapped = false;
    hand.roundContributions[seatId] = amount;
    hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + amount;
    resetActedSeats = true;
    hand.lastAggressor = seatId;
    if (seat.stack === 0) {
      seat.status = "ALL_IN";
    }
  } else if (action.type === "RAISE") {
    const maxTotal = seat.stack + (hand.roundContributions[seatId] ?? 0);
    const amount = Math.min(action.amount ?? hand.currentBet, maxTotal);
    const raiseSize = amount - hand.currentBet;
    const additional = amount - (hand.roundContributions[seatId] ?? 0);
    seat.stack -= Math.max(0, additional);
    hand.currentBet = amount;
    if (raiseSize >= previousMinRaise) {
      hand.minRaise = raiseSize;
      hand.raiseCapped = false;
      resetActedSeats = true;
      hand.lastAggressor = seatId;
    } else {
      hand.raiseCapped = true;
    }
    hand.roundContributions[seatId] = amount;
    hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + Math.max(0, additional);
    if (seat.stack === 0) {
      seat.status = "ALL_IN";
    }
  } else if (action.type === "ALL_IN") {
    const maxTotal = seat.stack + (hand.roundContributions[seatId] ?? 0);
    if (maxTotal <= hand.currentBet) {
      const toCall = getCallAmount(hand, seat);
      const amount = Math.min(toCall, seat.stack);
      seat.stack -= amount;
      hand.roundContributions[seatId] = (hand.roundContributions[seatId] ?? 0) + amount;
      hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + amount;
      if (seat.stack === 0) {
        seat.status = "ALL_IN";
      }
    } else {
      const amount = maxTotal;
      const raiseSize = amount - hand.currentBet;
      const additional = amount - (hand.roundContributions[seatId] ?? 0);
      seat.stack -= Math.max(0, additional);
      hand.currentBet = amount;
      if (raiseSize >= previousMinRaise) {
        hand.minRaise = raiseSize;
        hand.raiseCapped = false;
        resetActedSeats = true;
        hand.lastAggressor = seatId;
      } else {
        hand.raiseCapped = true;
      }
      hand.roundContributions[seatId] = amount;
      hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + Math.max(0, additional);
      seat.status = "ALL_IN";
    }
  }

  const actionRecord = createAction(hand.handId, seat, action, now());
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
  let handComplete = false;

  if (remaining.length === 1) {
    settleWinners(hand, tableState.seats, tableState.button);
    resetHandSeats(tableState.seats);
    hand.endedAt = now();
    handComplete = true;
  } else if (active.length === 0 || (active.length === 1 && remaining.length > 1)) {
    dealRemainingCommunityCards(hand);
    hand.street = "SHOWDOWN";
    settleShowdown(hand, tableState.seats, tableState.button);
    resetHandSeats(tableState.seats);
    hand.endedAt = now();
    handComplete = true;
  } else if (isBettingRoundComplete(hand, tableState.seats)) {
    if (hand.street === "RIVER") {
      settleShowdown(hand, tableState.seats, tableState.button);
      resetHandSeats(tableState.seats);
      hand.endedAt = now();
      handComplete = true;
    } else {
      advanceStreet(hand, tableState.seats, tableState.button);
    }
  } else {
    hand.turn = nextActiveSeat(tableState.seats, seatId);
  }

  return {
    state: { ...tableState, version: tableState.version + 1, updatedAt: now() },
    accepted: true,
    action: actionRecord,
    handComplete,
  };
}
