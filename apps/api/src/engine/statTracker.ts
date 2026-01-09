import { recordHandStats } from "../services/profileService";
import { HandState, TableSeat } from "./types";

export function recordHandCompletion(hand: HandState, seats: TableSeat[]) {
  const winners = new Set(hand.winners ?? []);
  for (const seat of seats) {
    if (!seat.userId || seat.status === "empty") {
      continue;
    }
    recordHandStats(seat.userId, {
      played: true,
      won: winners.has(seat.seatId),
    });
  }
}
