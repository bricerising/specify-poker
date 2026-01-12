import { test, expect, Page } from "@playwright/test";
import crypto from "crypto";

// --- JWT Helper ---
function base64Url(str: string | Buffer): string {
    return (Buffer.isBuffer(str) ? str : Buffer.from(str))
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function sign(data: string, secret: string): string {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(data);
    return base64Url(hmac.digest());
}

function generateToken(userId: string, nickname: string, secret = "default-secret"): string {
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
        sub: userId,
        nickname,
        iss: "poker-gateway",
        aud: "poker-ui",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const encodedHeader = base64Url(JSON.stringify(header));
    const encodedPayload = base64Url(JSON.stringify(payload));
    const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function loginAs(page: Page, userId: string, nickname: string) {
    const token = generateToken(userId, nickname);
    // We need to inject the token before the app loads or causes a redirect
    await page.addInitScript((val) => {
        window.sessionStorage.setItem("poker.auth.token", val);
    }, token);
    await page.goto("/");
}

async function setNickname(page: Page, userId: string, nickname: string) {
    const token = generateToken(userId, nickname);
    const res = await fetch("http://localhost:4000/api/me", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ nickname })
    });

    if (!res.ok) {
        const text = await res.text();
        console.error(`Failed to set nickname for ${userId}: ${res.status} ${text}`);
        throw new Error(`Failed to set nickname: ${res.status}`);
    }

    // Reload to ensure UI fetches fresh profile
    await page.reload();
}

test.describe("Full Stack Integration", () => {
    test.setTimeout(60000);
    // Use a unique suffix to avoid collisions in DB if running repeatedly
    const runId = Date.now().toString().slice(-4);
    const tableIdRef: { id: string } = { id: "" };

    test("Multiplayer Flow: Create Table, Join, Play", async ({ browser }) => {
        // --- Context A: Alice ---
        const contextA = await browser.newContext();
        const pageA = await contextA.newPage();
        const aliceId = `user-A-${runId}`;
        const aliceName = `Alice-${runId}`;
        await loginAs(pageA, aliceId, aliceName);
        await setNickname(pageA, aliceId, aliceName);

        // Alice creates a table
        await pageA.getByLabel("Name").fill(`Table ${runId}`);
        await pageA.getByRole("button", { name: "Create Table" }).click();

        // Verify Alice sees the table
        await expect(pageA.getByText(`Table ${runId}`)).toBeVisible();

        // Alice joins Seat 1
        await expect(pageA.getByRole("button", { name: "Join Seat 1" })).toBeVisible();
        await pageA.getByRole("button", { name: "Join Seat 1" }).click();
        await expect(pageA.getByText("Seat 1 Taken")).toBeVisible();


        // --- Context B: Bob ---
        const contextB = await browser.newContext();
        const pageB = await contextB.newPage();
        const bobId = `user-B-${runId}`;
        const bobName = `Bob-${runId}`;
        await loginAs(pageB, bobId, bobName);
        await setNickname(pageB, bobId, bobName);

        // Bob should see the table Alice created
        await expect(pageB.getByText(`Table ${runId}`)).toBeVisible();

        // Bob spectates first (optional verification of spectate)
        await pageB.getByRole("button", { name: "Watch" }).click();

        // Wait for table view to load
        await expect(pageB.getByText(`Blinds 1/2`)).toBeVisible();

        // Verify Alice is visible
        await expect(pageB.getByText(aliceName)).toBeVisible();

        // Bob takes Seat 2
        await pageB.getByRole("button", { name: "Join Seat 2" }).click();
        await expect(pageB.getByText(bobName)).toBeVisible(); // He sees himself

        // --- Verify Synchronization ---
        // Alice should see Bob
        await expect(pageA.getByText(bobName)).toBeVisible();

        // --- Cleanup ---
        await pageA.close();
        await pageB.close();
    });

    test("Profile Statistics", async ({ page }) => {
        const charlieId = `user-C-${runId}`;
        const charlieName = `Charlie-${runId}`;
        await loginAs(page, charlieId, charlieName);
        await setNickname(page, charlieId, charlieName);

        // Navigate to profile or just see the profile panel in Lobby
        await expect(page.getByText(charlieName)).toBeVisible();
        await expect(page.getByText("Hands Played")).toBeVisible();
        await expect(page.getByText("Wins")).toBeVisible();

        await expect(page.getByText("0")).toHaveCount(2); // Hands Played: 0, Wins: 0
    });

});
