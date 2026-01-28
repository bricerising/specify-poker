import type { TableSeat, TableState } from "./tableTypes";

type SeatId = number;

type SeatIdResolutionContext = {
  readonly matchingSeats: readonly TableSeat[];
  readonly turnSeatId: number | null;
};

type SeatIdResolutionStrategy = (ctx: SeatIdResolutionContext) => SeatId | null;

function resolveTurnSeatId({ matchingSeats, turnSeatId }: SeatIdResolutionContext): SeatId | null {
  if (typeof turnSeatId !== "number" || !Number.isFinite(turnSeatId)) {
    return null;
  }
  const seat = matchingSeats.find((candidate) => candidate.seatId === turnSeatId);
  return seat ? seat.seatId : null;
}

function resolveInHandSeatId({ matchingSeats }: SeatIdResolutionContext): SeatId | null {
  const seat =
    matchingSeats.find(
      (candidate) =>
        candidate.status === "ACTIVE" || candidate.status === "ALL_IN" || candidate.status === "FOLDED",
    ) ?? null;
  return seat ? seat.seatId : null;
}

function resolveFirstMatchingSeatId({ matchingSeats }: SeatIdResolutionContext): SeatId | null {
  return matchingSeats.length > 0 ? matchingSeats[0].seatId : null;
}

const SEAT_ID_RESOLUTION_STRATEGIES: readonly SeatIdResolutionStrategy[] = [
  resolveTurnSeatId,
  resolveInHandSeatId,
  resolveFirstMatchingSeatId,
] as const;

export function inferSeatIdForUserId(tableState: TableState, userId: string | null): number | null {
  if (!userId) {
    return null;
  }

  const matchingSeats = tableState.seats.filter((candidate) => candidate.userId === userId);
  if (matchingSeats.length === 0) {
    return null;
  }
  if (matchingSeats.length === 1) {
    return matchingSeats[0].seatId;
  }

  const ctx: SeatIdResolutionContext = {
    matchingSeats,
    turnSeatId: tableState.hand?.currentTurnSeat ?? null,
  };

  for (const strategy of SEAT_ID_RESOLUTION_STRATEGIES) {
    const seatId = strategy(ctx);
    if (seatId !== null) {
      return seatId;
    }
  }

  return matchingSeats[0].seatId;
}

