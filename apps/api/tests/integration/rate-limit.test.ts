import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/server";
import { resetRateLimit } from "../../src/http/middleware/rateLimit";

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

describe("rate limiting", () => {
  it("returns 429 when exceeding the limit", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_MAX = "2";

    resetRateLimit();

    const app = createApp({ useInMemoryTelemetry: true });
    const token = signToken("user-1");

    const requestWithAuth = () =>
      request(app).get("/api/me").set("Authorization", `Bearer ${token}`);

    const first = await requestWithAuth();
    const second = await requestWithAuth();
    const third = await requestWithAuth();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });
});
