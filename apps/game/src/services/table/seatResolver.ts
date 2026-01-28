import type { Seat, TableState } from "../../domain/types";

type SeatResolutionContext = {
  readonly matchingSeats: readonly Seat[];
  readonly turnSeatId: number | undefined;
};

type SeatResolutionStrategy = (ctx: SeatResolutionContext) => Seat | undefined;

function resolveTurnSeat({ matchingSeats, turnSeatId }: SeatResolutionContext): Seat | undefined {
  if (typeof turnSeatId !== "number") {
    return undefined;
  }
  return matchingSeats.find((seat) => seat.seatId === turnSeatId);
}

function resolveSeatWithHoleCards({ matchingSeats }: SeatResolutionContext): Seat | undefined {
  return matchingSeats.find((seat) => (seat.holeCards?.length ?? 0) === 2);
}

function resolveInHandSeat({ matchingSeats }: SeatResolutionContext): Seat | undefined {
  return (
    matchingSeats.find((seat) => seat.status === "ACTIVE" || seat.status === "ALL_IN" || seat.status === "FOLDED") ??
    undefined
  );
}

function resolveFirstMatchingSeat({ matchingSeats }: SeatResolutionContext): Seat | undefined {
  return matchingSeats[0];
}

const SEAT_RESOLUTION_STRATEGIES: readonly SeatResolutionStrategy[] = [
  resolveTurnSeat,
  resolveSeatWithHoleCards,
  resolveInHandSeat,
  resolveFirstMatchingSeat,
] as const;

export function resolveSeatForUser(state: TableState, userId: string): Seat | undefined {
  const matchingSeats = state.seats.filter((seat) => seat.userId === userId);
  if (matchingSeats.length === 0) {
    return undefined;
  }
  if (matchingSeats.length === 1) {
    return matchingSeats[0];
  }

  const ctx: SeatResolutionContext = { matchingSeats, turnSeatId: state.hand?.turn };
  for (const strategy of SEAT_RESOLUTION_STRATEGIES) {
    const resolved = strategy(ctx);
    if (resolved) {
      return resolved;
    }
  }

  return matchingSeats[0];
}

