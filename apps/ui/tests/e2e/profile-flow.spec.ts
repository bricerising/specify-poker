import { expect, test } from "@playwright/test";

test("profile flow updates nickname", async ({ page }) => {
  let profile = {
    userId: "user-1",
    nickname: "Ace",
    avatarUrl: null as string | null,
    stats: { handsPlayed: 1, wins: 0 },
    friends: [],
  };

  await page.route("**/api/me", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(profile),
      });
      return;
    }

    if (request.method() === "PUT") {
      const payload = JSON.parse(request.postData() ?? "{}") as {
        nickname?: string;
        avatarUrl?: string | null;
      };
      profile = {
        ...profile,
        nickname: payload.nickname ?? profile.nickname,
        avatarUrl: payload.avatarUrl ?? profile.avatarUrl,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(profile),
      });
      return;
    }

    await route.continue();
  });

  await page.addInitScript(() => {
    window.sessionStorage.setItem("poker.auth.token", "test-token");
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Profile" }).click();

  await page.getByLabel("Nickname").fill("RiverRat");
  await page.getByRole("button", { name: "Save Profile" }).click();

  await expect(page.locator(".profile-panel .table-name")).toHaveText("RiverRat");
});
