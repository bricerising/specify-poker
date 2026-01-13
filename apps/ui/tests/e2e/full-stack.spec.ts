import { test, expect } from "@playwright/test";
import crypto from "crypto";
import { generateToken, loginAs } from "./helpers/auth";
import { ensureBalance } from "./helpers/balance";

test.describe("Full Stack Integration", () => {
    test.setTimeout(60000);
    // Use a unique suffix to avoid collisions in DB if running repeatedly
    const runId = crypto.randomUUID().slice(0, 6);

    test("Multiplayer Flow: Create Table, Join Seats, Verify State", async ({ browser, request }) => {
        // --- Context A: Alice ---
        const contextA = await browser.newContext();
        const pageA = await contextA.newPage();
        const aliceId = `user-A-${runId}`;
        const aliceName = `Alice-${runId}`;
        await ensureBalance(aliceId);
        await loginAs(pageA, aliceId, aliceName);

        // Alice creates a table
        await pageA.getByLabel("Name").fill(`Table ${runId}`);
        await pageA.getByRole("button", { name: "Create Table" }).click();

        // Verify Alice sees the table
        await expect(pageA.getByText(`Table ${runId}`)).toBeVisible();

        // Alice joins Seat 1
        const aliceTableCard = pageA.locator(".table-card", { hasText: `Table ${runId}` });
        await expect(aliceTableCard).toBeVisible({ timeout: 15000 });
        await expect(aliceTableCard.getByRole("button", { name: "Join Seat 1" })).toBeVisible();
        await aliceTableCard.getByRole("button", { name: "Join Seat 1" }).click();
        await expect(aliceTableCard.getByRole("button", { name: "Seat 1 Taken" })).toBeVisible();


        // --- Context B: Bob ---
        const contextB = await browser.newContext();
        const pageB = await contextB.newPage();
        const bobId = `user-B-${runId}`;
        const bobName = `Bob-${runId}`;
        await ensureBalance(bobId);
        await loginAs(pageB, bobId, bobName);

        // Bob should see the table Alice created
        await expect(pageB.getByText(`Table ${runId}`)).toBeVisible({ timeout: 15000 });

        const bobTableCard = pageB.locator(".table-card", { hasText: `Table ${runId}` });
        // Bob takes Seat 2
        await expect(bobTableCard).toBeVisible();
        await bobTableCard.getByRole("button", { name: "Join Seat 2" }).click();
        await expect(bobTableCard.getByRole("button", { name: "Seat 2 Taken" })).toBeVisible();

        const apiToken = generateToken(aliceId, aliceName);
        const tablesResponse = await request.get("http://localhost:4000/api/tables", {
            headers: { Authorization: `Bearer ${apiToken}` },
        });
        const tables = (await tablesResponse.json()) as Array<{ table_id?: string; tableId?: string; name?: string }>;
        const targetTable = tables.find((table) => table.name === `Table ${runId}`);
        expect(targetTable?.table_id ?? targetTable?.tableId).toBeTruthy();
        const tableId = (targetTable?.table_id ?? targetTable?.tableId) as string;

        await expect.poll(async () => {
            const stateResponse = await request.get(`http://localhost:4000/api/tables/${tableId}/state`, {
                headers: { Authorization: `Bearer ${apiToken}` },
            });
            const payload = (await stateResponse.json()) as { state?: { seats?: Array<{ seat_id?: number; user_id?: string | null }> } };
            const seats = payload.state?.seats ?? [];
            const seat1 = seats.find((seat) => seat.seat_id === 0)?.user_id ?? null;
            const seat2 = seats.find((seat) => seat.seat_id === 1)?.user_id ?? null;
            return { seat1, seat2 };
        }, { timeout: 15000 }).toEqual({
            seat1: aliceId,
            seat2: bobId,
        });

        // --- Cleanup ---
        await pageA.close();
        await pageB.close();
    });

});
