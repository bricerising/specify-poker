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
const tableState_1 = require("../../src/services/tableState");
const secret = "test-secret";
function signToken(userId = "user-123") {
    return jsonwebtoken_1.default.sign({ sub: userId }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("tables endpoints", () => {
    (0, vitest_1.it)("joins and leaves a seat", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        const summary = (0, tableRegistry_1.createTable)({
            name: "Join Table",
            ownerId: "owner-1",
            config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 2,
                startingStack: 100,
                bettingStructure: "NoLimit",
            },
        });
        const app = (0, server_1.createApp)({ useInMemoryTelemetry: true });
        const token = signToken();
        const joinResponse = await (0, supertest_1.default)(app)
            .post(`/api/tables/${summary.tableId}/join`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seatId: 0 });
        (0, vitest_1.expect)(joinResponse.status).toBe(200);
        const leaveResponse = await (0, supertest_1.default)(app)
            .post(`/api/tables/${summary.tableId}/leave`)
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(leaveResponse.status).toBe(204);
    });
});
