"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const server_1 = require("../../src/server");
const tableRegistry_1 = require("../../src/services/tableRegistry");
const moderationService_1 = require("../../src/services/moderationService");
const tableState_1 = require("../../src/services/tableState");
const secret = "test-secret";
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ sub: userId, preferred_username: userId }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("moderation contract", () => {
    (0, vitest_1.it)("creates tables and allows owner moderation actions", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        (0, moderationService_1.resetModeration)();
        const server = (0, server_1.createServer)({ useInMemoryTelemetry: true });
        await new Promise((resolve) => server.listen(0, resolve));
        const ownerToken = signToken("owner-1");
        const targetToken = signToken("user-2");
        const createResponse = await (0, supertest_1.default)(server)
            .post("/api/tables")
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({
            name: "Moderation Table",
            config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 4,
                startingStack: 200,
            },
        });
        (0, vitest_1.expect)(createResponse.status).toBe(201);
        (0, vitest_1.expect)(createResponse.body).toMatchObject({
            name: "Moderation Table",
            ownerId: "owner-1",
            seatsTaken: 0,
            inProgress: false,
        });
        const tableId = createResponse.body.tableId;
        const joinResponse = await (0, supertest_1.default)(server)
            .post(`/api/tables/${tableId}/join`)
            .set("Authorization", `Bearer ${targetToken}`)
            .send({ seatId: 0 });
        (0, vitest_1.expect)(joinResponse.status).toBe(200);
        const muteResponse = await (0, supertest_1.default)(server)
            .post(`/api/tables/${tableId}/moderation/mute`)
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ seatId: 0 });
        (0, vitest_1.expect)(muteResponse.status).toBe(200);
        (0, vitest_1.expect)(muteResponse.body).toMatchObject({
            tableId,
            seatId: 0,
            userId: "user-2",
            action: "mute",
        });
        const kickResponse = await (0, supertest_1.default)(server)
            .post(`/api/tables/${tableId}/moderation/kick`)
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ seatId: 0 });
        (0, vitest_1.expect)(kickResponse.status).toBe(200);
        (0, vitest_1.expect)(kickResponse.body).toMatchObject({
            tableId,
            seatId: 0,
            userId: "user-2",
            action: "kick",
        });
        server.close();
    });
});
