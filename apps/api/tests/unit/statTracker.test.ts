import { describe, expect, it } from "vitest";

import { recordHandCompletion } from "../../src/engine/statTracker";
import { HandState, TableSeat } from "../../src/engine/types";
import { getProfile, resetProfiles } from "../../src/services/profileService";

describe("stat tracker", () => {
  it("increments hands played and wins for winners", async () => {
    await resetProfiles();

    const hand: HandState = {
      handId: "hand-1",
      tableId: "table-1",
      buttonSeat: 0,
      smallBlindSeat: 0,
      bigBlindSeat: 1,
      communityCards: [],
      pots: [],
      currentStreet: "ended",
      currentTurnSeat: 0,
      currentBet: 0,
      minRaise: 0,
      raiseCapped: false,
      roundContributions: { 0: 0, 1: 0 },
      totalContributions: { 0: 0, 1: 0 },
      actedSeats: [],
      actionTimerDeadline: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
      deck: [],
      holeCards: {},
      bigBlind: 10,
      winners: [1],
    };

    const seats: TableSeat[] = [
      { seatId: 0, userId: "u1", stack: 100, status: "active" },
      { seatId: 1, userId: "u2", stack: 100, status: "active" },
    ];

    await recordHandCompletion(hand, seats);

    expect((await getProfile("u1")).stats).toEqual({ handsPlayed: 1, wins: 0 });
    expect((await getProfile("u2")).stats).toEqual({ handsPlayed: 1, wins: 1 });
  });
});
