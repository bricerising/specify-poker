import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/server";
import { resetFriends } from "../../src/services/friendsService";
import { resetProfiles } from "../../src/services/profileService";

const secret = "test-secret";

function signToken(userId: string) {
  return jwt.sign(
    { sub: userId },
    secret,
    {
      algorithm: "HS256",
      issuer: "test-issuer",
      audience: "test-audience",
    },
  );
}

describe("profile endpoints", () => {
  it("updates nickname and avatar", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    resetProfiles();
    resetFriends();

    const app = createApp({ useInMemoryTelemetry: true });
    const token = signToken("user-1");

    const updateResponse = await request(app)
      .post("/api/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ nickname: "ChipStack", avatarUrl: "https://example.com/avatar.png" });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      userId: "user-1",
      nickname: "ChipStack",
      avatarUrl: "https://example.com/avatar.png",
    });

    const meResponse = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toMatchObject({
      userId: "user-1",
      nickname: "ChipStack",
      avatarUrl: "https://example.com/avatar.png",
    });
  });
});
