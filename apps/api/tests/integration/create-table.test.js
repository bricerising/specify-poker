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
function signToken(userId = "owner-1") {
    return jsonwebtoken_1.default.sign({ sub: userId }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("create table endpoint", () => {
    (0, vitest_1.it)("creates a table and returns it in the lobby list", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, tableRegistry_1.resetTables)();
        (0, tableState_1.resetTableStates)();
        const app = (0, server_1.createApp)({ useInMemoryTelemetry: true });
        const token = signToken();
        const createResponse = await (0, supertest_1.default)(app)
            .post("/api/tables")
            .set("Authorization", `Bearer ${token}`)
            .send({
            name: "Created Table",
            config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 6,
                startingStack: 500,
            },
        });
        (0, vitest_1.expect)(createResponse.status).toBe(201);
        (0, vitest_1.expect)(createResponse.body).toMatchObject({
            name: "Created Table",
            ownerId: "owner-1",
            seatsTaken: 0,
            inProgress: false,
        });
        const listResponse = await (0, supertest_1.default)(app)
            .get("/api/tables")
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(listResponse.status).toBe(200);
        (0, vitest_1.expect)(listResponse.body).toEqual(vitest_1.expect.arrayContaining([
            vitest_1.expect.objectContaining({ tableId: createResponse.body.tableId, name: "Created Table" }),
        ]));
    });
});
