import { expect, test } from "@playwright/test";

test("login flow redirects to Keycloak", async ({ page }) => {
  await page.goto("http://localhost:3000");

  const loginLink = page.getByRole("link", { name: "Login" });
  await loginLink.click();

  await expect(page).toHaveURL(/\/protocol\/openid-connect\/auth/);
});
