import type { Seat } from './types';

export function seatAt(seats: readonly Seat[], seatId: number): Seat | undefined {
  const seat = seats[seatId];
  if (!seat) {
    return undefined;
  }
  if (seat.seatId !== seatId) {
    return undefined;
  }
  return seat;
}
