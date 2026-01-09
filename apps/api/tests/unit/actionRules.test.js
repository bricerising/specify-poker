"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const actionRules_1 = require("../../src/engine/actionRules");
function createHand(overrides = {}) {
    return {
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
        startedAt: new Date().toISOString(),
        endedAt: null,
        deck: [],
        holeCards: {},
        bigBlind: 10,
        ...overrides,
    };
}
(0, vitest_1.describe)("action rules", () => {
    (0, vitest_1.it)("returns call and raise when facing a bet", () => {
        const hand = createHand();
        const seat = { seatId: 0, userId: "u1", stack: 100, status: "active" };
        const actions = (0, actionRules_1.deriveLegalActions)(hand, seat).map((action) => action.type);
        (0, vitest_1.expect)(actions).toContain("Call");
        (0, vitest_1.expect)(actions).toContain("Raise");
    });
    (0, vitest_1.it)("creates side pots based on contributions", () => {
        const pots = (0, actionRules_1.calculatePots)({ 0: 50, 1: 100, 2: 100 }, new Set([2]));
        (0, vitest_1.expect)(pots).toEqual([
            { amount: 150, eligibleSeatIds: [0, 1] },
            { amount: 100, eligibleSeatIds: [1] },
        ]);
    });
});
