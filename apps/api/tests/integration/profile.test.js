"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supertest_1 = __importDefault(require("supertest"));
const vitest_1 = require("vitest");
const server_1 = require("../../src/server");
const friendsService_1 = require("../../src/services/friendsService");
const profileService_1 = require("../../src/services/profileService");
const secret = "test-secret";
function signToken(userId) {
    return jsonwebtoken_1.default.sign({ sub: userId }, secret, {
        algorithm: "HS256",
        issuer: "test-issuer",
        audience: "test-audience",
    });
}
(0, vitest_1.describe)("profile endpoints", () => {
    (0, vitest_1.it)("updates nickname and avatar", async () => {
        process.env.JWT_HS256_SECRET = secret;
        process.env.JWT_ISSUER = "test-issuer";
        process.env.JWT_AUDIENCE = "test-audience";
        (0, profileService_1.resetProfiles)();
        (0, friendsService_1.resetFriends)();
        const app = (0, server_1.createApp)({ useInMemoryTelemetry: true });
        const token = signToken("user-1");
        const updateResponse = await (0, supertest_1.default)(app)
            .post("/api/profile")
            .set("Authorization", `Bearer ${token}`)
            .send({ nickname: "ChipStack", avatarUrl: "https://example.com/avatar.png" });
        (0, vitest_1.expect)(updateResponse.status).toBe(200);
        (0, vitest_1.expect)(updateResponse.body).toMatchObject({
            userId: "user-1",
            nickname: "ChipStack",
            avatarUrl: "https://example.com/avatar.png",
        });
        const meResponse = await (0, supertest_1.default)(app)
            .get("/api/me")
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(meResponse.status).toBe(200);
        (0, vitest_1.expect)(meResponse.body).toMatchObject({
            userId: "user-1",
            nickname: "ChipStack",
            avatarUrl: "https://example.com/avatar.png",
        });
    });
});
