import { expect, test } from "@playwright/test";

test("smoke flow: login, create table, join, play hand", async ({ page }) => {
  const tables: Array<Record<string, unknown>> = [];
  const tableId = "table-1";

  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId: "user-1",
        username: "Ace",
        avatarUrl: null,
        stats: { handsPlayed: 0, wins: 0 },
        friends: [],
      }),
    });
  });

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
        tableId,
        name: payload.name ?? "New Table",
        ownerId: "user-1",
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

  await page.route("**/api/tables/*/join", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tableId, seatId: 0, wsUrl: "ws://mock" }),
    });
  });

  await page.addInitScript(() => {
    window.sessionStorage.setItem("poker.auth.token", "test-token");

    class MockWebSocket {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      url: string;
      listeners: Record<string, Array<(event: { data?: string }) => void>> = {
        open: [],
        close: [],
        message: [],
      };
      tableState = {
        tableId: "table-1",
        name: "High Stakes",
        ownerId: "user-1",
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 6,
          startingStack: 500,
          bettingStructure: "NoLimit",
        },
        seats: [
          { seatId: 0, userId: "user-1", stack: 500, status: "active" },
          { seatId: 1, userId: null, stack: 0, status: "empty" },
        ],
        status: "in_hand",
        hand: {
          handId: "hand-1",
          currentStreet: "preflop",
          currentTurnSeat: 0,
          currentBet: 0,
          minRaise: 10,
          roundContributions: { 0: 0, 1: 0 },
          raiseCapped: false,
          actedSeats: [],
          communityCards: [],
          pots: [{ amount: 0, eligibleSeatIds: [0] }],
          actionTimerDeadline: null,
          bigBlind: 10,
        },
        version: 1,
      };

      constructor(url: string) {
        this.url = url;
        setTimeout(() => this.emit("open"), 0);
      }

      addEventListener(type: string, callback: (event: { data?: string }) => void) {
        this.listeners[type]?.push(callback);
      }

      emit(type: string, event: { data?: string } = {}) {
        for (const callback of this.listeners[type] ?? []) {
          callback(event);
        }
      }

      send(data: string) {
        const message = JSON.parse(data) as { type: string; tableId?: string };
        if (message.type === "SubscribeTable") {
          this.emit("message", {
            data: JSON.stringify({ type: "TableSnapshot", tableState: this.tableState }),
          });
        }
        if (message.type === "Action") {
          this.tableState = {
            ...this.tableState,
            hand: {
              ...this.tableState.hand,
              currentStreet: "ended",
            },
            version: this.tableState.version + 1,
          };
          this.emit("message", {
            data: JSON.stringify({ type: "TablePatch", patch: this.tableState }),
          });
        }
      }

      close() {
        this.readyState = 3;
        this.emit("close");
      }
    }

    // @ts-expect-error - test override
    window.WebSocket = MockWebSocket;
  });

  await page.goto("/");

  await page.getByLabel("Name").fill("High Stakes");
  await page.getByRole("button", { name: "Create Table" }).click();
  await page.getByRole("button", { name: "Join Seat 1" }).click();

  await expect(page.getByText("Table ID: table-1")).toBeVisible();
  await page.getByRole("button", { name: "Check" }).click();
  const streetFact = page.locator(".table-facts .fact").filter({ hasText: "Street" });
  await expect(streetFact).toContainText("ended");
});
