import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/server";

const secret = "test-secret";

function signToken() {
  return jwt.sign(
    {
      sub: "user-123",
      preferred_username: "Tester",
    },
    secret,
    {
      algorithm: "HS256",
      issuer: "test-issuer",
      audience: "test-audience",
    },
  );
}

describe("auth middleware", () => {
  it("rejects missing token", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    const app = createApp({ useInMemoryTelemetry: true });
    const response = await request(app).get("/api/me");

    expect(response.status).toBe(401);
  });

  it("allows valid token", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    const app = createApp({ useInMemoryTelemetry: true });
    const token = signToken();

    const response = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.userId).toBe("user-123");
  });
});
