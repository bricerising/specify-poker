import type { Seat } from '../domain/types';

export function nextActiveSeat(seats: Seat[], startSeat: number): number {
  const total = seats.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const seatId = (startSeat + offset) % total;
    if (seats[seatId]?.status === 'ACTIVE') {
      return seatId;
    }
  }
  return startSeat;
}

export function nextEligibleSeat(seats: Seat[], startSeat: number): number {
  const total = seats.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const seatId = (startSeat + offset) % total;
    if (seats[seatId]?.status === 'SEATED') {
      return seatId;
    }
  }
  return startSeat;
}

export function findEligibleSeats(seats: Seat[]): Seat[] {
  return seats.filter((seat) => seat.userId && seat.status === 'SEATED' && seat.stack > 0);
}

export function resetRoundContributions(seats: Seat[]): Record<number, number> {
  const contributions: Record<number, number> = {};
  for (const seat of seats) {
    contributions[seat.seatId] = 0;
  }
  return contributions;
}

export function getFoldedSeatIds(seats: Seat[]): Set<number> {
  return new Set(seats.filter((seat) => seat.status === 'FOLDED').map((seat) => seat.seatId));
}

export function activeSeatsRemaining(seats: Seat[]): Seat[] {
  return seats.filter((seat) => seat.status === 'ACTIVE' || seat.status === 'ALL_IN');
}

export function activeSeats(seats: Seat[]): Seat[] {
  return seats.filter((seat) => seat.status === 'ACTIVE');
}

export function resetHandSeats(seats: Seat[]): void {
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

