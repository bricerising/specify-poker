"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const handEngine_1 = require("../../src/engine/handEngine");
function createTableState() {
    return {
        tableId: "table-1",
        name: "Unit Table",
        config: {
            smallBlind: 5,
            bigBlind: 10,
            maxPlayers: 2,
            startingStack: 100,
            bettingStructure: "NoLimit",
        },
        seats: [
            { seatId: 0, userId: "u1", stack: 100, status: "active" },
            { seatId: 1, userId: "u2", stack: 100, status: "active" },
        ],
        status: "lobby",
        hand: null,
        version: 0,
    };
}
(0, vitest_1.describe)("hand engine", () => {
    (0, vitest_1.it)("advances streets through showdown", () => {
        const table = createTableState();
        const deck = [
            "AS",
            "KS",
            "QS",
            "JS",
            "TS",
            "9H",
            "8H",
            "7H",
            "6H",
        ];
        const started = (0, handEngine_1.startHand)(table, { deck, now: () => "2026-01-01T00:00:00.000Z" });
        (0, vitest_1.expect)(started.hand?.currentStreet).toBe("preflop");
        let state = (0, handEngine_1.applyAction)(started, 0, { type: "Call" }).table;
        state = (0, handEngine_1.applyAction)(state, 1, { type: "Check" }).table;
        (0, vitest_1.expect)(state.hand?.currentStreet).toBe("flop");
        state = (0, handEngine_1.applyAction)(state, state.hand.currentTurnSeat, { type: "Check" }).table;
        state = (0, handEngine_1.applyAction)(state, state.hand.currentTurnSeat, { type: "Check" }).table;
        (0, vitest_1.expect)(state.hand?.currentStreet).toBe("turn");
        state = (0, handEngine_1.applyAction)(state, state.hand.currentTurnSeat, { type: "Check" }).table;
        state = (0, handEngine_1.applyAction)(state, state.hand.currentTurnSeat, { type: "Check" }).table;
        (0, vitest_1.expect)(state.hand?.currentStreet).toBe("river");
        state = (0, handEngine_1.applyAction)(state, state.hand.currentTurnSeat, { type: "Check" }).table;
        state = (0, handEngine_1.applyAction)(state, state.hand.currentTurnSeat, { type: "Check" }).table;
        (0, vitest_1.expect)(state.hand?.currentStreet).toBe("ended");
        (0, vitest_1.expect)(state.hand?.communityCards.length).toBe(5);
    });
});
