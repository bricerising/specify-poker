"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ws_1 = __importDefault(require("ws"));
const vitest_1 = require("vitest");
const server_1 = require("../../src/server");
const tableRegistry_1 = require("../../src/services/tableRegistry");
const moderationService_1 = require("../../src/services/moderationService");
const tableState_1 = require("../../src/services/tableState");
const tableService_1 = require("../../src/services/tableService");
const secret = "test-secret";
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ sub: userId }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("ws chat hub", () => {
    (0, vitest_1.it)("broadcasts chat messages to table subscribers", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        (0, moderationService_1.resetModeration)();
        const summary = (0, tableRegistry_1.createTable)({
            name: "Chat Table",
            ownerId: "owner-1",
            config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 4,
                startingStack: 200,
                bettingStructure: "NoLimit",
            },
        });
        (0, tableService_1.joinSeat)({ tableId: summary.tableId, seatId: 0, userId: "user-a" });
        (0, tableService_1.joinSeat)({ tableId: summary.tableId, seatId: 1, userId: "user-b" });
        const server = (0, server_1.createServer)({ useInMemoryTelemetry: true });
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        const tokenA = signToken("user-a");
        const tokenB = signToken("user-b");
        const wsA = new ws_1.default(`ws://localhost:${port}/ws?token=${tokenA}`);
        const wsB = new ws_1.default(`ws://localhost:${port}/ws?token=${tokenB}`);
        await Promise.all([
            new Promise((resolve) => wsA.on("open", () => resolve())),
            new Promise((resolve) => wsB.on("open", () => resolve())),
        ]);
        const waitForSubscribed = (ws) => new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("chat subscribe timeout")), 2000);
            ws.on("message", function handleMessage(data) {
                const message = JSON.parse(data.toString());
                if (message.type === "ChatSubscribed") {
                    clearTimeout(timeout);
                    ws.off("message", handleMessage);
                    resolve();
                }
            });
        });
        wsA.send(JSON.stringify({ type: "SubscribeChat", tableId: summary.tableId }));
        wsB.send(JSON.stringify({ type: "SubscribeChat", tableId: summary.tableId }));
        await Promise.all([waitForSubscribed(wsA), waitForSubscribed(wsB)]);
        const messagePromise = new Promise((resolve) => {
            wsB.on("message", (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === "ChatMessage") {
                    resolve(message);
                }
            });
        });
        wsA.send(JSON.stringify({ type: "ChatSend", tableId: summary.tableId, message: "hello table" }));
        const received = await messagePromise;
        (0, vitest_1.expect)(received.message.text).toBe("hello table");
        (0, vitest_1.expect)(received.message.userId).toBe("user-a");
        wsA.close();
        wsB.close();
        server.close();
    });
});
