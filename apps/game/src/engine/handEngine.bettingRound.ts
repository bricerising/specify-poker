import type { HandState, HandStreet, Seat } from '../domain/types';
import { dealCards } from './handEngine.deck';
import { nextActiveSeat, resetRoundContributions } from './handEngine.seats';

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

export function dealRemainingCommunityCards(hand: HandState): void {
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

export function isBettingRoundComplete(hand: HandState, seats: Seat[]): boolean {
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

export function advanceStreet(hand: HandState, seats: Seat[], buttonSeat: number): HandState {
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

