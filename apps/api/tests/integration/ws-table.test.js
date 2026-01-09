"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supertest_1 = __importDefault(require("supertest"));
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
(0, vitest_1.describe)("ws table hub", () => {
    (0, vitest_1.it)("broadcasts table patches", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        const summary = (0, tableRegistry_1.createTable)({
            name: "WS Table",
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
        await new Promise((resolve) => wsA.on("open", () => resolve()));
        wsA.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
        const patchPromise = new Promise((resolve) => {
            wsA.on("message", (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === "TablePatch") {
                    resolve(message);
                }
            });
        });
        wsA.send(JSON.stringify({
            type: "Action",
            tableId: summary.tableId,
            action: "Call",
        }));
        const patch = await patchPromise;
        (0, vitest_1.expect)(patch.type).toBe("TablePatch");
        wsA.close();
        server.close();
    });
});
