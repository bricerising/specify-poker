"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const server_1 = require("../../src/server");
const rateLimit_1 = require("../../src/http/middleware/rateLimit");
const secret = "test-secret";
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ sub: userId }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("rate limiting", () => {
    (0, vitest_1.it)("returns 429 when exceeding the limit", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        process.env.RATE_LIMIT_WINDOW_MS = "60000";
        process.env.RATE_LIMIT_MAX = "2";
        (0, rateLimit_1.resetRateLimit)();
        const app = (0, server_1.createApp)({ useInMemoryTelemetry: true });
        const token = signToken("user-1");
        const requestWithAuth = () => (0, supertest_1.default)(app).get("/api/me").set("Authorization", `Bearer ${token}`);
        const first = await requestWithAuth();
        const second = await requestWithAuth();
        const third = await requestWithAuth();
        (0, vitest_1.expect)(first.status).toBe(200);
        (0, vitest_1.expect)(second.status).toBe(200);
        (0, vitest_1.expect)(third.status).toBe(429);
    });
});
