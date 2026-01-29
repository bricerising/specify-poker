import { seatAt } from '../domain/seats';
import type { Card, HandState, Seat } from '../domain/types';
import { calculateRake } from './potCalculator';
import { calculatePotPayouts } from './potSettlement';
import { evaluateWinners } from './rankings';
import { dealRemainingCommunityCards } from './handEngine.bettingRound';
import { resetHandSeats } from './handEngine.seats';

const MAX_RAKE = 5;

function settleWinners(
  hand: HandState,
  seats: Seat[],
  buttonSeat: number,
  potWinners?: Record<number, number[]>,
): void {
  const winnersSet = new Set<number>();
  const totalPot = hand.pots.reduce((sum, pot) => sum + Math.max(0, pot.amount), 0);
  let remainingRake = calculateRake(totalPot, MAX_RAKE);
  hand.rakeAmount = 0;

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
    if (amountToDistribute > 0 && remainingRake > 0) {
      const rake = Math.min(amountToDistribute, remainingRake);
      remainingRake -= rake;
      amountToDistribute -= rake;
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

export function endHandByFold(
  hand: HandState,
  seats: Seat[],
  buttonSeat: number,
  endedAt: string,
): void {
  settleWinners(hand, seats, buttonSeat);
  resetHandSeats(seats);
  hand.endedAt = endedAt;
}

export function endHandByShowdown(
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

export function endHandAtRiver(
  hand: HandState,
  seats: Seat[],
  buttonSeat: number,
  endedAt: string,
): void {
  settleShowdown(hand, seats, buttonSeat);
  resetHandSeats(seats);
  hand.endedAt = endedAt;
}

