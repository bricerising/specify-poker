import { expect, test } from "@playwright/test";
import crypto from "crypto";
import { ensureBalance } from "./helpers/balance";
import { loginAs } from "./helpers/auth";

test.describe("Action Bar Presets", () => {
  test.setTimeout(90_000);

  test("shows slider + 1/2, 3/4, pot, all-in presets when betting is available", async ({ browser }) => {
    const runId = crypto.randomUUID().slice(0, 8);
    const tableName = `E2E Presets ${runId}`;
    const aliceId = `user-presets-a-${runId}`;
    const bobId = `user-presets-b-${runId}`;

    await ensureBalance(aliceId);
    await ensureBalance(bobId);

    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await loginAs(pageAlice, aliceId, `Alice${runId}`);

    await pageAlice.getByLabel("Name").fill(tableName);
    await pageAlice.getByRole("button", { name: "Create Table" }).click();
    const tableCardAlice = pageAlice.locator(".table-card", { hasText: tableName });
    await expect(tableCardAlice).toBeVisible({ timeout: 15_000 });
    await tableCardAlice.getByRole("button", { name: "Join Seat 1" }).click();
    await expect(pageAlice.getByText("Table ID:")).toBeVisible({ timeout: 15_000 });

    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await loginAs(pageBob, bobId, `Bob${runId}`);

    const tableCardBob = pageBob.locator(".table-card", { hasText: tableName });
    await expect(tableCardBob).toBeVisible({ timeout: 15_000 });
    await tableCardBob.getByRole("button", { name: "Join Seat 2" }).click();
    await expect(pageBob.getByText("Table ID:")).toBeVisible({ timeout: 15_000 });

    const aliceAction = pageAlice.getByRole("heading", { name: "Action" });
    const bobAction = pageBob.getByRole("heading", { name: "Action" });

    const startedAt = Date.now();
    let actionPage: typeof pageAlice | null = null;
    while (Date.now() - startedAt < 20_000) {
      if (await aliceAction.isVisible().catch(() => false)) {
        actionPage = pageAlice;
        break;
      }
      if (await bobAction.isVisible().catch(() => false)) {
        actionPage = pageBob;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(actionPage, "expected one player to have legal actions").not.toBeNull();
    actionPage = actionPage as typeof pageAlice;

    await expect(actionPage.getByRole("heading", { name: "Action" })).toBeVisible();
    await expect(actionPage.getByRole("button", { name: "1/2 Pot" })).toBeVisible();
    await expect(actionPage.getByRole("button", { name: "3/4 Pot" })).toBeVisible();
    await expect(actionPage.getByRole("button", { name: "Pot", exact: true })).toBeVisible();
    await expect(actionPage.getByRole("button", { name: "All-in" })).toBeVisible();
    await expect(actionPage.getByLabel("Bet sizing")).toBeVisible();

    await contextAlice.close();
    await contextBob.close();
  });
});
