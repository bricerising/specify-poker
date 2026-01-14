import { expect, test } from "@playwright/test";
import crypto from "crypto";
import { generateToken } from "./helpers/auth";
import { urls } from "./helpers/urls";
import { authHeaders } from "./helpers/http";

test.describe("Push Notifications (via Gateway -> Notify)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "API-only checks run once.");
  test.setTimeout(30_000);

  test("exposes VAPID public key and supports subscribe/unsubscribe", async ({ request }) => {
    const userId = `user-push-${crypto.randomUUID().slice(0, 10)}`;
    const token = generateToken(userId, "PushUser");

    const vapid = await request.get(`${urls.gateway}/api/push/vapid`, { headers: authHeaders(token) });
    expect(vapid.ok()).toBeTruthy();
    const vapidPayload = (await vapid.json()) as { publicKey?: string };
    expect(typeof vapidPayload.publicKey).toBe("string");
    expect((vapidPayload.publicKey ?? "").length).toBeGreaterThan(10);

    const endpoint = `https://example.test/push/${crypto.randomUUID()}`;
    const subscribe = await request.post(`${urls.gateway}/api/push/subscribe`, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      data: {
        endpoint,
        keys: {
          p256dh: "p256dh-test",
          auth: "auth-test",
        },
      },
    });
    expect(subscribe.status()).toBe(204);

    const unsubscribe = await request.delete(`${urls.gateway}/api/push/subscribe`, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      data: { endpoint },
    });
    expect(unsubscribe.status()).toBe(204);
  });
});

