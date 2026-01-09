import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createServer } from "../../src/server";
import { resetFriends } from "../../src/services/friendsService";
import { resetProfiles } from "../../src/services/profileService";

const secret = "test-secret";

function signToken(userId: string) {
  return jwt.sign(
    { sub: userId, preferred_username: "Ace", picture: "https://example.com/avatar.png" },
    secret,
    {
      algorithm: "HS256",
      issuer: "test-issuer",
      audience: "test-audience",
    },
  );
}

describe("profile contract", () => {
  it("returns and updates the current user profile", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    resetProfiles();
    resetFriends();

    const server = createServer({ useInMemoryTelemetry: true });
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const token = signToken("user-1");

    const meResponse = await request(server)
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toMatchObject({
      userId: "user-1",
      nickname: "Ace",
      avatarUrl: "https://example.com/avatar.png",
      stats: { handsPlayed: 0, wins: 0 },
      friends: [],
    });

    const updateResponse = await request(server)
      .post("/api/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ nickname: "RiverRat", avatarUrl: null });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      userId: "user-1",
      nickname: "RiverRat",
      avatarUrl: null,
    });

    server.close();
  });
});
