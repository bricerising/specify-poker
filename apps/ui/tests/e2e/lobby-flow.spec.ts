import { expect, test } from "@playwright/test";

test("lobby flow creates a table and updates the list", async ({ page }) => {
  const tables: Array<Record<string, unknown>> = [];

  await page.route("**/api/tables", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(tables),
      });
      return;
    }

    if (request.method() === "POST") {
      const payload = JSON.parse(request.postData() ?? "{}") as {
        name?: string;
        config?: Record<string, number>;
      };
      const created = {
        tableId: "table-1",
        name: payload.name ?? "New Table",
        ownerId: "owner-1",
        config: {
          smallBlind: payload.config?.smallBlind ?? 5,
          bigBlind: payload.config?.bigBlind ?? 10,
          maxPlayers: payload.config?.maxPlayers ?? 6,
          startingStack: payload.config?.startingStack ?? 500,
          bettingStructure: "NoLimit",
        },
        seatsTaken: 0,
        inProgress: false,
      };
      tables.splice(0, tables.length, created);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }

    await route.continue();
  });

  await page.addInitScript(() => {
    window.sessionStorage.setItem("poker.auth.token", "test-token");
  });

  await page.goto("/");

  await page.getByLabel("Name").fill("High Stakes");
  await page.getByRole("button", { name: "Create Table" }).click();

  await expect(page.getByText("High Stakes")).toBeVisible();
});
