import { randomUUID } from "crypto";

import { calculatePots, getCallAmount, validateAction } from "./actionRules";
import { evaluateWinners } from "./handEval";
import { HandActionInput, HandState, HandStreet, TableSeat, TableState } from "./types";

function createDeck() {
  const suits = ["C", "D", "H", "S"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const deck: string[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(`${rank}${suit}`);
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

function seededShuffle(deck: string[], seed: string) {
  const result = [...deck];
  let state = hashSeed(seed) || 1;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (state * 48271) % 2147483647;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function nextActiveSeat(seats: TableSeat[], startSeat: number) {
  const total = seats.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const seat = seats[(startSeat + offset) % total];
    if (seat.status === "active") {
      return seat.seatId;
    }
  }
  return startSeat;
}

function findOccupiedSeats(seats: TableSeat[]) {
  return seats.filter((seat) => seat.userId && seat.status !== "empty");
}

function getActionOrderSeat(seats: TableSeat[], reference: number) {
  const total = seats.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const seat = seats[(reference + offset) % total];
    if (seat.status === "active") {
      return seat.seatId;
    }
  }
  return reference;
}

function resetRoundContributions(seats: TableSeat[]) {
  const contributions: Record<number, number> = {};
  for (const seat of seats) {
    contributions[seat.seatId] = 0;
  }
  return contributions;
}

function dealCards(deck: string[], count: number) {
  return deck.splice(0, count);
}

export function startHand(
  table: TableState,
  options: { deck?: string[]; now?: () => string } = {},
): TableState {
  const now = options.now ?? (() => new Date().toISOString());
  const occupied = findOccupiedSeats(table.seats).filter((seat) => seat.status === "active");
  if (occupied.length < 2) {
    return table;
  }

  const sortedSeats = occupied.map((seat) => seat.seatId).sort((a, b) => a - b);
  const buttonSeat = sortedSeats[0];
  const smallBlindSeat =
    occupied.length === 2 ? buttonSeat : nextActiveSeat(table.seats, buttonSeat);
  const bigBlindSeat = nextActiveSeat(table.seats, smallBlindSeat);

  const deck = options.deck ?? seededShuffle(createDeck(), `${table.tableId}:${now()}`);
  const holeCards: Record<number, [string, string]> = {};
  for (const seat of occupied) {
    holeCards[seat.seatId] = dealCards(deck, 2) as [string, string];
  }

  const roundContributions = resetRoundContributions(table.seats);
  const totalContributions = resetRoundContributions(table.seats);

  const smallBlindAmount = Math.min(table.config.smallBlind, table.seats[smallBlindSeat].stack);
  const bigBlindAmount = Math.min(table.config.bigBlind, table.seats[bigBlindSeat].stack);

  table.seats[smallBlindSeat].stack -= smallBlindAmount;
  table.seats[bigBlindSeat].stack -= bigBlindAmount;

  roundContributions[smallBlindSeat] = smallBlindAmount;
  roundContributions[bigBlindSeat] = bigBlindAmount;
  totalContributions[smallBlindSeat] = smallBlindAmount;
  totalContributions[bigBlindSeat] = bigBlindAmount;

  if (table.seats[smallBlindSeat].stack === 0) {
    table.seats[smallBlindSeat].status = "all_in";
  }
  if (table.seats[bigBlindSeat].stack === 0) {
    table.seats[bigBlindSeat].status = "all_in";
  }

  const hand: HandState = {
    handId: randomUUID(),
    tableId: table.tableId,
    buttonSeat,
    smallBlindSeat,
    bigBlindSeat,
    communityCards: [],
    pots: [],
    currentStreet: "preflop",
    currentTurnSeat: getActionOrderSeat(table.seats, bigBlindSeat),
    currentBet: bigBlindAmount,
    minRaise: table.config.bigBlind,
    roundContributions,
    totalContributions,
    actedSeats: [],
    actionTimerDeadline: null,
    startedAt: now(),
    endedAt: null,
    deck,
    holeCards,
    bigBlind: table.config.bigBlind,
    winners: undefined,
  };

  hand.pots = calculatePots(hand.totalContributions, getFoldedSeatIds(table.seats));

  return {
    ...table,
    status: "in_hand",
    hand,
    version: table.version + 1,
  };
}

function getFoldedSeatIds(seats: TableSeat[]) {
  return new Set(seats.filter((seat) => seat.status === "folded").map((seat) => seat.seatId));
}

function activeSeatsRemaining(seats: TableSeat[]) {
  return seats.filter((seat) => seat.status === "active" || seat.status === "all_in");
}

function isBettingRoundComplete(hand: HandState, seats: TableSeat[]) {
  if (hand.currentBet === 0) {
    for (const seat of seats) {
      if (seat.status !== "active") {
        continue;
      }
      if (!hand.actedSeats.includes(seat.seatId)) {
        return false;
      }
    }
    return true;
  }
  for (const seat of seats) {
    if (seat.status !== "active") {
      continue;
    }
    const contribution = hand.roundContributions[seat.seatId] ?? 0;
    if (contribution < hand.currentBet) {
      return false;
    }
  }
  return true;
}

function advanceStreet(hand: HandState, seats: TableSeat[], now: () => string) {
  const nextStreetMap: Record<HandStreet, HandStreet> = {
    preflop: "flop",
    flop: "turn",
    turn: "river",
    river: "showdown",
    showdown: "ended",
    ended: "ended",
  };

  const nextStreet = nextStreetMap[hand.currentStreet];
  if (nextStreet === "showdown") {
    hand.currentStreet = "showdown";
    return hand;
  }

  if (hand.currentStreet === "preflop") {
    hand.communityCards.push(...dealCards(hand.deck, 3));
  } else if (hand.currentStreet === "flop" || hand.currentStreet === "turn") {
    hand.communityCards.push(...dealCards(hand.deck, 1));
  }

  hand.currentStreet = nextStreet;
  hand.roundContributions = resetRoundContributions(seats);
  hand.currentBet = 0;
  hand.minRaise = hand.bigBlind;
  hand.currentTurnSeat = getActionOrderSeat(seats, hand.buttonSeat);
  hand.actionTimerDeadline = null;
  hand.actedSeats = [];

  if (nextStreet === "river") {
    hand.currentTurnSeat = getActionOrderSeat(seats, hand.buttonSeat);
  }

  if (nextStreet === "ended") {
    hand.endedAt = now();
  }

  return hand;
}

function settleShowdown(hand: HandState, seats: TableSeat[]) {
  const eligibleSeats = seats.filter((seat) => seat.status !== "folded" && seat.userId);
  const players: Record<number, string[]> = {};
  for (const seat of eligibleSeats) {
    players[seat.seatId] = hand.holeCards[seat.seatId] ?? [];
  }
  const { winners } = evaluateWinners(players, hand.communityCards);
  hand.winners = winners;

  const potTotal = hand.pots.reduce((sum, pot) => sum + pot.amount, 0);
  if (winners.length > 0 && potTotal > 0) {
    const share = Math.floor(potTotal / winners.length);
    let remainder = potTotal - share * winners.length;
    for (const winnerSeatId of winners) {
      const seat = seats.find((entry) => entry.seatId === winnerSeatId);
      if (!seat) {
        continue;
      }
      seat.stack += share + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
    }
  }

  for (const seat of seats) {
    if (seat.status === "folded" || seat.status === "all_in") {
      seat.status = seat.userId ? "active" : "empty";
    }
  }

  hand.currentStreet = "ended";
  hand.endedAt = new Date().toISOString();
}

export function applyAction(
  table: TableState,
  seatId: number,
  action: HandActionInput,
  options: { now?: () => string } = {},
) {
  const hand = table.hand;
  if (!hand) {
    return { table, accepted: false, reason: "no_hand" };
  }

  if (hand.currentTurnSeat !== seatId) {
    return { table, accepted: false, reason: "not_your_turn" };
  }

  const seat = table.seats.find((entry) => entry.seatId === seatId);
  if (!seat) {
    return { table, accepted: false, reason: "seat_missing" };
  }

  const validation = validateAction(hand, seat, action);
  if (!validation.ok) {
    return { table, accepted: false, reason: validation.reason };
  }

  const now = options.now ?? (() => new Date().toISOString());

  if (action.type === "Fold") {
    seat.status = "folded";
  } else if (action.type === "Check") {
    // no-op
  } else if (action.type === "Call") {
    const toCall = getCallAmount(hand, seat);
    const amount = Math.min(toCall, seat.stack);
    seat.stack -= amount;
    hand.roundContributions[seatId] = (hand.roundContributions[seatId] ?? 0) + amount;
    hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + amount;
    if (seat.stack === 0) {
      seat.status = "all_in";
    }
  } else if (action.type === "Bet") {
    const amount = Math.min(action.amount ?? 0, seat.stack);
    seat.stack -= amount;
    hand.currentBet = amount;
    hand.minRaise = amount;
    hand.roundContributions[seatId] = amount;
    hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + amount;
    if (seat.stack === 0) {
      seat.status = "all_in";
    }
  } else if (action.type === "Raise") {
    const amount = Math.min(action.amount ?? hand.currentBet, seat.stack + (hand.roundContributions[seatId] ?? 0));
    const raiseSize = amount - hand.currentBet;
    const additional = amount - (hand.roundContributions[seatId] ?? 0);
    seat.stack -= Math.max(0, additional);
    hand.currentBet = amount;
    hand.minRaise = Math.max(raiseSize, hand.minRaise);
    hand.roundContributions[seatId] = amount;
    hand.totalContributions[seatId] = (hand.totalContributions[seatId] ?? 0) + Math.max(0, additional);
    if (seat.stack === 0) {
      seat.status = "all_in";
    }
  }

  hand.pots = calculatePots(hand.totalContributions, getFoldedSeatIds(table.seats));
  if (!hand.actedSeats.includes(seatId)) {
    hand.actedSeats.push(seatId);
  }

  const remaining = activeSeatsRemaining(table.seats);
  if (remaining.length === 1) {
    hand.winners = remaining.map((seat) => seat.seatId);
    remaining[0].stack += hand.pots.reduce((sum, pot) => sum + pot.amount, 0);
    for (const seat of table.seats) {
      if (seat.status === "folded" || seat.status === "all_in") {
        seat.status = seat.userId ? "active" : "empty";
      }
    }
    hand.currentStreet = "ended";
    hand.endedAt = now();
    table.status = "lobby";
  } else if (isBettingRoundComplete(hand, table.seats)) {
    if (hand.currentStreet === "river") {
      settleShowdown(hand, table.seats);
      table.status = "lobby";
    } else {
      advanceStreet(hand, table.seats, now);
    }
  } else {
    hand.currentTurnSeat = nextActiveSeat(table.seats, seatId);
  }

  return { table: { ...table, version: table.version + 1 }, accepted: true };
}
