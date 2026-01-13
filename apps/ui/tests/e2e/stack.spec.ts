import { test, expect } from "@playwright/test";
import crypto from "crypto";
import { generateToken, loginAs } from "./helpers/auth";
import { ensureBalance } from "./helpers/balance";

test.describe("Docker Compose Stack", () => {
  test.setTimeout(60000);

  test("shows main table and profile stats after auth", async ({ page }) => {
    const userId = `user-${crypto.randomUUID().slice(0, 8)}`;
    await loginAs(page, userId, `Player${userId.slice(0, 4)}`);

    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
    await expect(page.getByText("Main Table").first()).toBeVisible();
  });

  test("creates a table and seats two players", async ({ browser, request }) => {
    const runId = crypto.randomUUID().slice(0, 6);
    const tableName = `E2E Table ${runId}`;
    const aliceId = `user-alice-${runId}`;
    const bobId = `user-bob-${runId}`;
    const aliceName = `Alice${runId}`;
    const bobName = `Bob${runId}`;

    await ensureBalance(aliceId);
    await ensureBalance(bobId);

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAs(pageA, aliceId, aliceName);

    await pageA.getByLabel("Name").fill(tableName);
    await pageA.getByRole("button", { name: "Create Table" }).click();

    const tableCardA = pageA.locator(".table-card", { hasText: tableName });
    await expect(tableCardA).toBeVisible({ timeout: 15000 });
    await tableCardA.getByRole("button", { name: "Join Seat 1" }).click();

    await expect(tableCardA.getByRole("button", { name: "Seat 1 Taken" })).toBeVisible();

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAs(pageB, bobId, bobName);

    const tableCardB = pageB.locator(".table-card", { hasText: tableName });
    await expect(tableCardB).toBeVisible();
    await tableCardB.getByRole("button", { name: "Join Seat 2" }).click();
    await expect(tableCardB.getByRole("button", { name: "Seat 2 Taken" })).toBeVisible();

    const apiToken = generateToken(aliceId, aliceName);
    const tablesResponse = await request.get("http://localhost:4000/api/tables", {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const tables = (await tablesResponse.json()) as Array<{ table_id?: string; tableId?: string; name?: string }>;
    const targetTable = tables.find((table) => table.name === tableName);
    expect(targetTable?.table_id ?? targetTable?.tableId).toBeTruthy();
    const tableId = (targetTable?.table_id ?? targetTable?.tableId) as string;

    await expect.poll(async () => {
      const stateResponse = await request.get(`http://localhost:4000/api/tables/${tableId}/state`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      const payload = (await stateResponse.json()) as {
        state?: { seats?: Array<{ seat_id?: number; user_id?: string | null }> };
      };
      const seats = payload.state?.seats ?? [];
      const seat1 = seats.find((seat) => seat.seat_id === 0)?.user_id ?? null;
      const seat2 = seats.find((seat) => seat.seat_id === 1)?.user_id ?? null;
      return { seat1, seat2 };
    }, { timeout: 15000 }).toEqual({
      seat1: aliceId,
      seat2: bobId,
    });

    await pageA.close();
    await pageB.close();
  });
});
