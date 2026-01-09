"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const handEval_1 = require("../../src/engine/handEval");
(0, vitest_1.describe)("hand evaluation", () => {
    (0, vitest_1.it)("ranks a straight flush above other hands", () => {
        const rank = (0, handEval_1.evaluateBestHand)(["AS", "KS", "QS", "JS", "TS", "2D", "3C"]);
        (0, vitest_1.expect)(rank.category).toBe(8);
        (0, vitest_1.expect)(rank.tiebreaker[0]).toBe(14);
    });
    (0, vitest_1.it)("selects winner based on best hand", () => {
        const players = {
            0: ["AH", "AD"],
            1: ["KH", "9D"],
        };
        const community = ["2C", "7S", "9H", "JC", "3D"];
        const result = (0, handEval_1.evaluateWinners)(players, community);
        (0, vitest_1.expect)(result.winners).toEqual([0]);
    });
});
