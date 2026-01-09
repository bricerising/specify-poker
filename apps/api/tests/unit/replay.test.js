"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const handReplay_1 = require("../../src/services/handReplay");
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
(0, vitest_1.describe)("hand replay", () => {
    (0, vitest_1.it)("replays to the latest snapshot", () => {
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
        const replay = (0, handReplay_1.replayHand)(events);
        (0, vitest_1.expect)(replay?.currentStreet).toBe("flop");
        (0, vitest_1.expect)(replay?.communityCards.length).toBe(3);
    });
});
