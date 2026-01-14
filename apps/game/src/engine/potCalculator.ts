import { Pot } from "../domain/types";

export function calculatePots(
  contributions: Record<number, number>,
  foldedSeatIds: Set<number>,
): Pot[] {
  const entries = Object.entries(contributions)
    .filter(([, amount]) => amount > 0)
    .map(([seatId, amount]) => ({ seatId: Number(seatId), amount }))
    .sort((a, b) => a.amount - b.amount);

  if (entries.length === 0) {
    return [];
  }

  const pots: Pot[] = [];
  let remaining = [...entries];
  let previous = 0;

  for (const entry of entries) {
    const level = entry.amount - previous;
    if (level > 0) {
      const amount = level * remaining.length;
      const eligibleSeatIds = remaining
        .map((seat) => seat.seatId)
        .filter((seatId) => !foldedSeatIds.has(seatId));
      pots.push({ amount, eligibleSeats: eligibleSeatIds });
      previous = entry.amount;
    }
    remaining = remaining.filter((seat) => seat.seatId !== entry.seatId);
  }

  return pots;
}

export function calculateRake(amount: number, remainingCap: number): number {
  if (amount <= 20 || remainingCap <= 0) return 0;
  return Math.min(remainingCap, Math.floor(amount * 0.05));
}
