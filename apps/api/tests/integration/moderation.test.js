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
    return jsonwebtoken_1.default.sign({ sub: userId }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("moderation endpoints", () => {
    (0, vitest_1.it)("allows the owner to mute and kick a player", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        (0, moderationService_1.resetModeration)();
        const summary = (0, tableRegistry_1.createTable)({
            name: "Moderation Table",
            ownerId: "owner-1",
            config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 4,
                startingStack: 200,
                bettingStructure: "NoLimit",
            },
        });
        const app = (0, server_1.createApp)({ useInMemoryTelemetry: true });
        const ownerToken = signToken("owner-1");
        const userToken = signToken("user-2");
        await (0, supertest_1.default)(app)
            .post(`/api/tables/${summary.tableId}/join`)
            .set("Authorization", `Bearer ${userToken}`)
            .send({ seatId: 0 });
        const muteResponse = await (0, supertest_1.default)(app)
            .post(`/api/tables/${summary.tableId}/moderation/mute`)
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ seatId: 0 });
        (0, vitest_1.expect)(muteResponse.status).toBe(200);
        (0, vitest_1.expect)(muteResponse.body).toMatchObject({
            action: "mute",
            seatId: 0,
            userId: "user-2",
        });
        const kickResponse = await (0, supertest_1.default)(app)
            .post(`/api/tables/${summary.tableId}/moderation/kick`)
            .set("Authorization", `Bearer ${ownerToken}`)
            .send({ seatId: 0 });
        (0, vitest_1.expect)(kickResponse.status).toBe(200);
        (0, vitest_1.expect)(kickResponse.body).toMatchObject({
            action: "kick",
            seatId: 0,
            userId: "user-2",
        });
        const state = (0, tableState_1.getTableState)(summary.tableId);
        const seat = state?.seats.find((entry) => entry.seatId === 0);
        (0, vitest_1.expect)(seat?.userId).toBeNull();
    });
});
