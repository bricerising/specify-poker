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

    await expect(pageAlice.getByRole("heading", { name: "Action" })).toBeVisible({ timeout: 15_000 });
    await expect(pageAlice.getByText("1/2 Pot")).toBeVisible();
    await expect(pageAlice.getByText("3/4 Pot")).toBeVisible();
    await expect(pageAlice.getByText("Pot")).toBeVisible();
    await expect(pageAlice.getByText("All-in")).toBeVisible();
    await expect(pageAlice.getByLabel("Bet sizing")).toBeVisible();

    await contextAlice.close();
    await contextBob.close();
  });
});
