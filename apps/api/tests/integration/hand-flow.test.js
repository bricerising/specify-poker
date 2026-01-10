"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supertest_1 = __importDefault(require("supertest"));
const ws_1 = __importDefault(require("ws"));
const vitest_1 = require("vitest");
const otel_1 = require("../../src/observability/otel");
const server_1 = require("../../src/server");
const tableRegistry_1 = require("../../src/services/tableRegistry");
const tableState_1 = require("../../src/services/tableState");
const secret = "test-secret";
function signToken(userId) {
    return jsonwebtoken_1.default.sign({
        sub: userId,
        preferred_username: userId,
    }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
async function waitForMessage(ws, predicate, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.off("message", handleMessage);
            ws.off("error", handleError);
            reject(new Error("Timed out waiting for message"));
        }, timeoutMs);
        const handleMessage = (data) => {
            const message = JSON.parse(data.toString());
            if (predicate(message)) {
                clearTimeout(timeout);
                ws.off("message", handleMessage);
                ws.off("error", handleError);
                resolve(message);
            }
        };
        const handleError = (error) => {
            clearTimeout(timeout);
            ws.off("message", handleMessage);
            ws.off("error", handleError);
            reject(error);
        };
        ws.on("message", handleMessage);
        ws.on("error", handleError);
    });
}
(0, vitest_1.describe)("hand flow", () => {
    (0, vitest_1.it)("plays a full hand through showdown", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        const summary = (0, tableRegistry_1.createTable)({
            name: "Hand Flow",
            ownerId: "owner-1",
            config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 2,
                startingStack: 100,
                bettingStructure: "NoLimit",
            },
        });
        const server = (0, server_1.createServer)({ useInMemoryTelemetry: true });
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        const tokenA = signToken("user-a");
        const tokenB = signToken("user-b");
        await (0, supertest_1.default)(server)
            .post(`/api/tables/${summary.tableId}/join`)
            .set("Authorization", `Bearer ${tokenA}`)
            .send({ seatId: 0 });
        await (0, supertest_1.default)(server)
            .post(`/api/tables/${summary.tableId}/join`)
            .set("Authorization", `Bearer ${tokenB}`)
            .send({ seatId: 1 });
        const wsA = new ws_1.default(`ws://localhost:${port}/ws?token=${tokenA}`);
        const wsB = new ws_1.default(`ws://localhost:${port}/ws?token=${tokenB}`);
        await Promise.all([
            new Promise((resolve) => wsA.on("open", () => resolve())),
            new Promise((resolve) => wsB.on("open", () => resolve())),
        ]);
        wsA.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
        wsB.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
        let tableState = (await waitForMessage(wsA, (message) => message.type === "TableSnapshot"))
            .tableState;
        (0, vitest_1.expect)(tableState?.hand?.currentStreet).toBe("preflop");
        const sendAction = (ws, action, amount) => {
            ws.send(JSON.stringify({
                type: "Action",
                tableId: summary.tableId,
                handId: tableState?.hand?.handId,
                action,
                amount,
            }));
        };
        const playHand = async () => {
            let guard = 0;
            while (tableState?.hand && tableState.hand.currentStreet !== "ended") {
                if (guard > 20) {
                    throw new Error("hand did not complete");
                }
                const hand = tableState.hand;
                const seatId = hand.currentTurnSeat;
                const toCall = Math.max(0, hand.currentBet - (hand.roundContributions[seatId] ?? 0));
                const action = toCall > 0 ? "Call" : "Check";
                const nextPatch = waitForMessage(wsA, (message) => message.type === "TablePatch");
                if (seatId === 0) {
                    sendAction(wsA, action);
                }
                else {
                    sendAction(wsB, action);
                }
                tableState = (await nextPatch).patch;
                guard += 1;
            }
        };
        await playHand();
        (0, vitest_1.expect)(tableState?.hand?.currentStreet).toBe("ended");
        (0, vitest_1.expect)(tableState?.hand?.communityCards.length).toBe(5);
        wsA.close();
        wsB.close();
        server.close();
        const spans = (0, otel_1.getInMemoryExporter)()?.getFinishedSpans() ?? [];
        const lifecycleSpans = spans.filter((span) => span.name === "poker.hand.transition");
        (0, vitest_1.expect)(lifecycleSpans.length).toBeGreaterThan(0);
    }, 15000);
});
