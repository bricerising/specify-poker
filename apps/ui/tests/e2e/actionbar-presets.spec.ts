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

    await pageAlice.getByTestId("create-table-name").fill(tableName);
    await pageAlice.getByTestId("create-table-submit").click();
    const tableCardAlice = pageAlice.getByTestId("lobby-table-card").filter({ hasText: tableName });
    await expect(tableCardAlice).toBeVisible({ timeout: 15_000 });
    await tableCardAlice.locator('[data-testid="lobby-join-seat"][data-seat-number="1"]').click();
    await expect(pageAlice.getByText("Table ID:")).toBeVisible({ timeout: 15_000 });

    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await loginAs(pageBob, bobId, `Bob${runId}`);

    const tableCardBob = pageBob.getByTestId("lobby-table-card").filter({ hasText: tableName });
    await expect(tableCardBob).toBeVisible({ timeout: 15_000 });
    await tableCardBob.locator('[data-testid="lobby-join-seat"][data-seat-number="2"]').click();
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
    await expect(actionPage.getByTestId("action-preset-half-pot")).toBeVisible();
    await expect(actionPage.getByTestId("action-preset-three-quarter-pot")).toBeVisible();
    await expect(actionPage.getByTestId("action-preset-pot")).toBeVisible();
    await expect(actionPage.getByTestId("action-preset-all-in")).toBeVisible();
    await expect(actionPage.getByTestId("action-bet-sizing")).toBeVisible();

    await contextAlice.close();
    await contextBob.close();
  });
});
