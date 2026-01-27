import { expect, test } from "@playwright/test";

test("login flow redirects to Keycloak", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("auth-login").click();

  await expect(page).toHaveURL(/\/protocol\/openid-connect\/auth/);
});

test("login flow completes with demo user", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto("/");
  await page.getByTestId("auth-login").click();

  await expect(page).toHaveURL(/\/realms\/poker-local\/protocol\/openid-connect\/auth/);

  await page.getByRole("textbox", { name: "Username" }).fill("demo");
  await page.getByRole("textbox", { name: "Password" }).fill("demo");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible({ timeout: 30_000 });
});
