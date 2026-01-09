import { describe, expect, it } from "vitest";

import { HandEvent } from "../../src/services/eventStore";
import { replayHand } from "../../src/services/handReplay";

const baseSnapshot = {
  handId: "hand-1",
  tableId: "table-1",
  buttonSeat: 0,
  smallBlindSeat: 0,
  bigBlindSeat: 1,
  communityCards: [],
  pots: [],
  currentStreet: "preflop",
  currentTurnSeat: 0,
  currentBet: 10,
  minRaise: 10,
  roundContributions: { 0: 0, 1: 10 },
  totalContributions: { 0: 0, 1: 10 },
  actedSeats: [],
  actionTimerDeadline: null,
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: null,
  deck: [],
  holeCards: {},
  bigBlind: 10,
};

describe("hand replay", () => {
  it("replays to the latest snapshot", () => {
    const events = [
      {
        eventId: "evt-1",
        handId: "hand-1",
        type: "HandStarted",
        payload: { snapshot: baseSnapshot },
        ts: "2026-01-01T00:00:00.000Z",
      },
      {
        eventId: "evt-2",
        handId: "hand-1",
        type: "ActionTaken",
        payload: {
          snapshot: { ...baseSnapshot, currentStreet: "flop", communityCards: ["AS", "KS", "QS"] },
        },
        ts: "2026-01-01T00:00:01.000Z",
      },
    ];

    const replay = replayHand(events as HandEvent[]);
    expect(replay?.currentStreet).toBe("flop");
    expect(replay?.communityCards.length).toBe(3);
  });
});
