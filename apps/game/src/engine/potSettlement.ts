export type PotPayout = {
  readonly seatId: number;
  readonly amount: number;
};

function seatDistanceFromButton(seatId: number, buttonSeat: number, seatCount: number): number {
  return (seatId - buttonSeat + seatCount) % seatCount;
}

export function orderSeatIdsFromButton(
  seatIds: readonly number[],
  buttonSeat: number,
  seatCount: number,
): number[] {
  if (seatCount <= 0) {
    return [...seatIds];
  }

  return [...seatIds].sort((a, b) => {
    const distA = seatDistanceFromButton(a, buttonSeat, seatCount);
    const distB = seatDistanceFromButton(b, buttonSeat, seatCount);
    return distA - distB;
  });
}

export function calculatePotPayouts(options: {
  amount: number;
  winnerSeatIds: readonly number[];
  buttonSeat: number;
  seatCount: number;
}): PotPayout[] {
  if (options.amount <= 0 || options.winnerSeatIds.length === 0) {
    return [];
  }

  const orderedWinners = orderSeatIdsFromButton(
    options.winnerSeatIds,
    options.buttonSeat,
    options.seatCount,
  );

  const share = Math.floor(options.amount / orderedWinners.length);
  let remainder = options.amount - share * orderedWinners.length;

  return orderedWinners.map((seatId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder = Math.max(0, remainder - 1);
    return { seatId, amount: share + extra };
  });
}

