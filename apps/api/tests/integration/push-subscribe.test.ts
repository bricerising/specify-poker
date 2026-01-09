import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/server";
import { pushNotifications } from "../../src/services/pushNotifications";

const secret = "test-secret";

function signToken() {
  return jwt.sign({ sub: "user-123" }, secret, {
    algorithm: "HS256",
    issuer: "test-issuer",
    audience: "test-audience",
  });
}

describe("push subscription", () => {
  it("registers and unregisters subscriptions", async () => {
    process.env.JWT_HS256_SECRET = secret;
    process.env.JWT_ISSUER = "test-issuer";
    process.env.JWT_AUDIENCE = "test-audience";

    await pushNotifications.clear();
    const app = createApp({ useInMemoryTelemetry: true });
    const token = signToken();

    const subscription = {
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "key", auth: "auth" },
    };

    const registerResponse = await request(app)
      .post("/api/push/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send(subscription);

    expect(registerResponse.status).toBe(204);
    expect(await pushNotifications.list("user-123")).toHaveLength(1);

    const deleteResponse = await request(app)
      .delete("/api/push/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: subscription.endpoint });

    expect(deleteResponse.status).toBe(204);
    expect(await pushNotifications.list("user-123")).toHaveLength(0);
  });
});
