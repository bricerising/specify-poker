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

describe("friends endpoints", () => {
  it("stores and returns friends list", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    resetProfiles();
    resetFriends();

    const app = createApp({ useInMemoryTelemetry: true });
    const token = signToken("user-1");

    const updateResponse = await request(app)
      .put("/api/friends")
      .set("Authorization", `Bearer ${token}`)
      .send({ friends: ["friend-a", "friend-b", "friend-a"] });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toEqual({ friends: ["friend-a", "friend-b"] });

    const listResponse = await request(app)
      .get("/api/friends")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual({ friends: ["friend-a", "friend-b"] });

    const profileResponse = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`);

    expect(profileResponse.body.friends).toEqual(["friend-a", "friend-b"]);
  });
});
