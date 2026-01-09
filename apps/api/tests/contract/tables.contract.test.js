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
function signToken(userId = "user-123") {
    return jsonwebtoken_1.default.sign({
        sub: userId,
        preferred_username: "Tester",
    }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("tables contract", () => {
    (0, vitest_1.it)("lists tables and returns join payload with wsUrl", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        const summary = (0, tableRegistry_1.createTable)({
            name: "Contract Table",
            ownerId: "owner-1",
            config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 6,
                startingStack: 500,
                bettingStructure: "NoLimit",
            },
        });
        const server = (0, server_1.createServer)({ useInMemoryTelemetry: true });
        await new Promise((resolve) => server.listen(0, resolve));
        const token = signToken();
        const listResponse = await (0, supertest_1.default)(server)
            .get("/api/tables")
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(listResponse.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(listResponse.body)).toBe(true);
        (0, vitest_1.expect)(listResponse.body[0]).toMatchObject({
            tableId: summary.tableId,
            name: "Contract Table",
            seatsTaken: 0,
            inProgress: false,
        });
        const joinResponse = await (0, supertest_1.default)(server)
            .post(`/api/tables/${summary.tableId}/join`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seatId: 0 });
        (0, vitest_1.expect)(joinResponse.status).toBe(200);
        (0, vitest_1.expect)(joinResponse.body).toMatchObject({
            tableId: summary.tableId,
            seatId: 0,
        });
        (0, vitest_1.expect)(joinResponse.body.wsUrl).toContain("/ws");
        server.close();
    });
    (0, vitest_1.it)("emits TableSnapshot on subscribe", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        const summary = (0, tableRegistry_1.createTable)({
            name: "Snapshot Table",
            ownerId: "owner-1",
            config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 6,
                startingStack: 500,
                bettingStructure: "NoLimit",
            },
        });
        const server = (0, server_1.createServer)({ useInMemoryTelemetry: true });
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        const token = signToken();
        const ws = new ws_1.default(`ws://localhost:${port}/ws?token=${token}`);
        const snapshot = await new Promise((resolve, reject) => {
            ws.on("message", (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === "TableSnapshot") {
                    resolve(message);
                }
            });
            ws.on("error", reject);
            ws.on("open", () => {
                ws.send(JSON.stringify({ type: "SubscribeTable", tableId: summary.tableId }));
            });
        });
        (0, vitest_1.expect)(snapshot.type).toBe("TableSnapshot");
        const state = snapshot.tableState;
        (0, vitest_1.expect)(state.tableId).toBe(summary.tableId);
        (0, vitest_1.expect)((0, tableState_1.getTableState)(summary.tableId)).not.toBeNull();
        ws.close();
        server.close();
    });
});
