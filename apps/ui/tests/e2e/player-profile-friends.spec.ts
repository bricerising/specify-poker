import { expect, test } from "@playwright/test";
import crypto from "crypto";
import { generateToken, loginAs } from "./helpers/auth";
import { authHeaders } from "./helpers/http";
import { urls } from "./helpers/urls";

test.describe("Player Service (via Gateway)", () => {
  test.describe("Profile API", () => {
    test.skip(({ browserName }) => browserName !== "chromium", "API-only checks run once.");
    test.setTimeout(30_000);

    test("auto-provisions a default profile and supports GDPR delete", async ({ request }) => {
      const userId = `user-prof-${crypto.randomUUID().slice(0, 10)}`;
      const token = generateToken(userId, "ProfileUser");

      const me = await request.get(`${urls.gateway}/api/me`, { headers: authHeaders(token) });
      expect(me.ok()).toBeTruthy();
      const mePayload = (await me.json()) as { userId?: string; nickname?: string; avatarUrl?: string | null };
      expect(mePayload.userId).toBe(userId);
      expect(typeof mePayload.nickname).toBe("string");
      expect((mePayload.nickname ?? "").length).toBeGreaterThanOrEqual(2);
      expect((mePayload.nickname ?? "").length).toBeLessThanOrEqual(20);

      const deleteRes = await request.delete(`${urls.gateway}/api/me`, { headers: authHeaders(token) });
      expect(deleteRes.status()).toBe(204);

      const deleted = await request.get(`${urls.gateway}/api/profile/${userId}`, { headers: authHeaders(token) });
      expect(deleted.ok()).toBeTruthy();
      const deletedPayload = (await deleted.json()) as { userId?: string; nickname?: string };
      expect(deletedPayload.userId).toBe(userId);
      expect(deletedPayload.nickname).toBe("Deleted User");
    });
  });

  test.describe("UI Profile + Friends Flows", () => {
    test.setTimeout(60_000);

    test("updates nickname with 2-20 character validation", async ({ page }) => {
      const runId = crypto.randomUUID().slice(0, 8);
      const userId = `user-ui-${runId}`;
      await loginAs(page, userId, `Player${runId}`);

      await page.getByRole("button", { name: "Profile" }).click();
      await expect(page.getByRole("heading", { name: "Profile & Stats" })).toBeVisible();

      const nicknameInput = page.getByLabel("Nickname");
      await nicknameInput.fill("A");
      await expect(page.getByRole("button", { name: "Save Profile" })).toBeDisabled();

      const newNickname = `E2E${runId}`;
      await nicknameInput.fill(newNickname);
      await expect(page.getByRole("button", { name: "Save Profile" })).toBeEnabled();
      await page.getByRole("button", { name: "Save Profile" }).click();
      await expect(page.getByText(newNickname)).toBeVisible();
    });

    test("adds and removes friends", async ({ page }) => {
      const runId = crypto.randomUUID().slice(0, 8);
      const userId = `user-friends-${runId}`;
      await loginAs(page, userId, `Player${runId}`);

      await page.getByRole("button", { name: "Friends" }).click();
      await expect(page.getByRole("heading", { name: "Friends" })).toBeVisible();

      const friendId = `friend-${crypto.randomUUID().slice(0, 6)}`;
      await page.getByLabel("Add Friend").fill(friendId);
      await page.getByRole("button", { name: "Add" }).click();
      await expect(page.getByText(friendId)).toBeVisible();

      await page.getByRole("button", { name: "Remove" }).click();
      await expect(page.getByText(friendId)).toBeHidden();
    });
  });
});

