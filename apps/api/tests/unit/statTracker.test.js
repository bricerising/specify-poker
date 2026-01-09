"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const statTracker_1 = require("../../src/engine/statTracker");
const profileService_1 = require("../../src/services/profileService");
(0, vitest_1.describe)("stat tracker", () => {
    (0, vitest_1.it)("increments hands played and wins for winners", () => {
        (0, profileService_1.resetProfiles)();
        const hand = {
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
        const seats = [
            { seatId: 0, userId: "u1", stack: 100, status: "active" },
            { seatId: 1, userId: "u2", stack: 100, status: "active" },
        ];
        (0, statTracker_1.recordHandCompletion)(hand, seats);
        (0, vitest_1.expect)((0, profileService_1.getProfile)("u1").stats).toEqual({ handsPlayed: 1, wins: 0 });
        (0, vitest_1.expect)((0, profileService_1.getProfile)("u2").stats).toEqual({ handsPlayed: 1, wins: 1 });
    });
});
