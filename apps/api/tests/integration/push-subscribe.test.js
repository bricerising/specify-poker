"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const server_1 = require("../../src/server");
const pushNotifications_1 = require("../../src/services/pushNotifications");
const secret = "test-secret";
function signToken() {
    return jsonwebtoken_1.default.sign({ sub: "user-123" }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("push subscription", () => {
    (0, vitest_1.it)("registers and unregisters subscriptions", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        pushNotifications_1.pushNotifications.clear();
        const app = (0, server_1.createApp)({ useInMemoryTelemetry: true });
        const token = signToken();
        const subscription = {
            endpoint: "https://push.example.com/abc",
            keys: { p256dh: "key", auth: "auth" },
        };
        const registerResponse = await (0, supertest_1.default)(app)
            .post("/api/push/subscribe")
            .set("Authorization", `Bearer ${token}`)
            .send(subscription);
        (0, vitest_1.expect)(registerResponse.status).toBe(204);
        (0, vitest_1.expect)(pushNotifications_1.pushNotifications.list("user-123")).toHaveLength(1);
        const deleteResponse = await (0, supertest_1.default)(app)
            .delete("/api/push/subscribe")
            .set("Authorization", `Bearer ${token}`)
            .send({ endpoint: subscription.endpoint });
        (0, vitest_1.expect)(deleteResponse.status).toBe(204);
        (0, vitest_1.expect)(pushNotifications_1.pushNotifications.list("user-123")).toHaveLength(0);
    });
});
