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
const tableState_1 = require("../../src/services/tableState");
const secret = "test-secret";
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ sub: userId }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("ws resync", () => {
    (0, vitest_1.it)("responds with a table snapshot on resync request", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        const summary = (0, tableRegistry_1.createTable)({
            name: "Resync Table",
            ownerId: "owner-1",
            config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 4,
                startingStack: 200,
                bettingStructure: "NoLimit",
            },
        });
        const server = (0, server_1.createServer)({ useInMemoryTelemetry: true });
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        const token = signToken("user-a");
        const ws = new ws_1.default(`ws://localhost:${port}/ws?token=${token}`);
        await new Promise((resolve) => ws.on("open", () => resolve()));
        let snapshots = 0;
        const snapshotPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("snapshot timeout")), 2000);
            ws.on("message", (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === "TableSnapshot") {
                    snapshots += 1;
                    if (snapshots === 2) {
                        clearTimeout(timeout);
                        resolve();
                    }
                }
            });
        });
        ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
        ws.send(JSON.stringify({ type: "ResyncTable", tableId: summary.tableId }));
        await snapshotPromise;
        (0, vitest_1.expect)(snapshots).toBe(2);
        ws.close();
        server.close();
    });
});
