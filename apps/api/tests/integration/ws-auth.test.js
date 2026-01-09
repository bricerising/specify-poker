"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ws_1 = __importDefault(require("ws"));
const vitest_1 = require("vitest");
const server_1 = require("../../src/server");
const secret = "test-secret";
function signToken() {
    return jsonwebtoken_1.default.sign({
        sub: "user-123",
    }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("websocket auth", () => {
    (0, vitest_1.it)("rejects missing token", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        const server = (0, server_1.createServer)({ useInMemoryTelemetry: true });
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        const ws = new ws_1.default(`ws://localhost:${port}/ws`);
        const closeCode = await new Promise((resolve) => {
            ws.on("close", (code) => resolve(code));
        });
        server.close();
        (0, vitest_1.expect)(closeCode).toBe(1008);
    });
    (0, vitest_1.it)("accepts valid token", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        const server = (0, server_1.createServer)({ useInMemoryTelemetry: true });
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        const token = signToken();
        const ws = new ws_1.default(`ws://localhost:${port}/ws?token=${token}`);
        const welcome = await new Promise((resolve, reject) => {
            ws.on("message", (data) => resolve(data.toString()));
            ws.on("error", reject);
        });
        ws.close();
        server.close();
        (0, vitest_1.expect)(JSON.parse(welcome).type).toBe("Welcome");
    });
});
