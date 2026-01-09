"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const server_1 = require("../../src/server");
const secret = "test-secret";
function signToken() {
    return jsonwebtoken_1.default.sign({
        sub: "user-123",
        preferred_username: "Tester",
    }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("auth middleware", () => {
    (0, vitest_1.it)("rejects missing token", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        const app = (0, server_1.createApp)({ useInMemoryTelemetry: true });
        const response = await (0, supertest_1.default)(app).get("/api/me");
        (0, vitest_1.expect)(response.status).toBe(401);
    });
    (0, vitest_1.it)("allows valid token", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        const app = (0, server_1.createApp)({ useInMemoryTelemetry: true });
        const token = signToken();
        const response = await (0, supertest_1.default)(app)
            .get("/api/me")
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body.userId).toBe("user-123");
    });
});
