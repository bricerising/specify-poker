import { expect, test } from "@playwright/test";

test.describe("gameplay flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem("poker.auth.token", "test-token");
    });

    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "user-1",
          username: "TestPlayer",
          avatarUrl: null,
          stats: { handsPlayed: 10, wins: 3 },
          friends: [],
        }),
      });
    });

    await page.route("**/api/tables", async (route, request) => {
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              tableId: "table-1",
              name: "Test Table",
              ownerId: "owner-1",
              config: {
                smallBlind: 5,
                bigBlind: 10,
                maxPlayers: 6,
                startingStack: 500,
                bettingStructure: "NoLimit",
              },
              seatsTaken: 1,
              occupiedSeatIds: [0],
              inProgress: false,
              spectatorCount: 0,
            },
          ]),
        });
        return;
      }
      await route.continue();
    });

    await page.route("**/api/tables/*/join", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tableId: "table-1", seatId: 1, wsUrl: "ws://mock" }),
      });
    });

    await page.addInitScript(() => {
      class MockWebSocket {
        static OPEN = 1;
        readyState = MockWebSocket.OPEN;
        url: string;
        listeners: Record<string, Array<(event: { data?: string }) => void>> = {
          open: [],
          close: [],
          message: [],
        };

        handState = {
          handId: "hand-1",
          currentStreet: "preflop",
          currentTurnSeat: 1,
          currentBet: 10,
          minRaise: 10,
          roundContributions: { 0: 5, 1: 10 },
          raiseCapped: false,
          actedSeats: [] as number[],
          communityCards: [] as string[],
          pots: [{ amount: 15, eligibleSeatIds: [0, 1] }],
          actionTimerDeadline: new Date(Date.now() + 20000).toISOString(),
          bigBlind: 10,
        };

        tableState = {
          tableId: "table-1",
          name: "Test Table",
          ownerId: "owner-1",
          config: {
            smallBlind: 5,
            bigBlind: 10,
            maxPlayers: 6,
            startingStack: 500,
            bettingStructure: "NoLimit",
          },
          seats: [
            { seatId: 0, userId: "owner-1", username: "Owner", stack: 495, status: "active" },
            { seatId: 1, userId: "user-1", username: "TestPlayer", stack: 490, status: "active" },
          ],
          spectators: [],
          status: "in_hand",
          hand: this.handState,
          version: 1,
        };

        constructor(url: string) {
          this.url = url;
          setTimeout(() => this.emit("open"), 0);
        }

        addEventListener(type: string, callback: (event: { data?: string }) => void) {
          this.listeners[type]?.push(callback);
        }

        removeEventListener(type: string, callback: (event: { data?: string }) => void) {
          const arr = this.listeners[type];
          if (arr) {
            const idx = arr.indexOf(callback);
            if (idx >= 0) arr.splice(idx, 1);
          }
        }

        emit(type: string, event: { data?: string } = {}) {
          for (const callback of this.listeners[type] ?? []) {
            callback(event);
          }
        }

        send(data: string) {
          const message = JSON.parse(data) as { type: string };
          if (message.type === "SubscribeTable") {
            this.emit("message", {
              data: JSON.stringify({ type: "TableSnapshot", tableState: this.tableState }),
            });
            setTimeout(() => {
              this.emit("message", {
                data: JSON.stringify({
                  type: "HoleCards",
                  tableId: "table-1",
                  handId: "hand-1",
                  seatId: 1,
                  cards: ["Ah", "Kd"],
                }),
              });
            }, 50);
          }
          if (message.type === "Action") {
            this.tableState = {
              ...this.tableState,
              hand: {
                ...this.handState,
                currentStreet: "flop",
                communityCards: ["Qs", "Jh", "Tc"],
                currentTurnSeat: 0,
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
  });

  test("player can see hole cards after joining", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Join Seat 2" }).click();

    await expect(page.getByLabel("A of hearts")).toBeVisible();
    await expect(page.getByLabel("K of diamonds")).toBeVisible();
  });

  test("player can take action when it is their turn", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Join Seat 2" }).click();

    await expect(page.getByRole("button", { name: "Check" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Raise" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fold" })).toBeVisible();
  });

  test("action progresses the hand to next street", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Join Seat 2" }).click();

    await page.getByRole("button", { name: "Check" }).click();

    await expect(page.getByText("Street")).toBeVisible();
    await expect(page.getByText("flop")).toBeVisible();
  });

  test("community cards appear after flop", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Join Seat 2" }).click();
    await page.getByRole("button", { name: "Check" }).click();

    await expect(page.getByLabel("Q of spades")).toBeVisible();
    await expect(page.getByLabel("J of hearts")).toBeVisible();
    await expect(page.getByLabel("10 of clubs")).toBeVisible();
  });

  test("pot amount is displayed", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Join Seat 2" }).click();

    const potFact = page.locator(".table-facts .fact").filter({ hasText: "Pot" });
    await expect(potFact).toContainText("15");
  });
});

test.describe("timer display", () => {
  test("timer shows countdown", async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem("poker.auth.token", "test-token");
    });

    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "user-1",
          username: "TestPlayer",
          avatarUrl: null,
          stats: { handsPlayed: 0, wins: 0 },
          friends: [],
        }),
      });
    });

    await page.route("**/api/tables", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            tableId: "table-1",
            name: "Timer Table",
            ownerId: "owner-1",
            config: {
              smallBlind: 5,
              bigBlind: 10,
              maxPlayers: 2,
              startingStack: 500,
              bettingStructure: "NoLimit",
            },
            seatsTaken: 1,
            occupiedSeatIds: [0],
            inProgress: true,
          },
        ]),
      });
    });

    await page.route("**/api/tables/*/join", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tableId: "table-1", seatId: 1, wsUrl: "ws://mock" }),
      });
    });

    await page.addInitScript(() => {
      class MockWebSocket {
        static OPEN = 1;
        readyState = MockWebSocket.OPEN;
        url: string;
        listeners: Record<string, Array<(event: { data?: string }) => void>> = {
          open: [],
          message: [],
          close: [],
        };

        constructor(url: string) {
          this.url = url;
          setTimeout(() => this.emit("open"), 0);
        }

        addEventListener(type: string, callback: (event: { data?: string }) => void) {
          this.listeners[type]?.push(callback);
        }

        removeEventListener() {}

        emit(type: string, event: { data?: string } = {}) {
          for (const callback of this.listeners[type] ?? []) {
            callback(event);
          }
        }

        send(data: string) {
          const message = JSON.parse(data) as { type: string };
          if (message.type === "SubscribeTable") {
            this.emit("message", {
              data: JSON.stringify({
                type: "TableSnapshot",
                tableState: {
                  tableId: "table-1",
                  name: "Timer Table",
                  ownerId: "owner-1",
                  config: {
                    smallBlind: 5,
                    bigBlind: 10,
                    maxPlayers: 2,
                    startingStack: 500,
                    bettingStructure: "NoLimit",
                  },
                  seats: [
                    { seatId: 0, userId: "owner-1", stack: 500, status: "active" },
                    { seatId: 1, userId: "user-1", stack: 500, status: "active" },
                  ],
                  status: "in_hand",
                  hand: {
                    handId: "hand-1",
                    currentStreet: "preflop",
                    currentTurnSeat: 1,
                    currentBet: 10,
                    minRaise: 10,
                    roundContributions: {},
                    raiseCapped: false,
                    actedSeats: [],
                    communityCards: [],
                    pots: [{ amount: 15, eligibleSeatIds: [0, 1] }],
                    actionTimerDeadline: new Date(Date.now() + 15000).toISOString(),
                    bigBlind: 10,
                  },
                  version: 1,
                },
              }),
            });
          }
        }

        close() {
          this.readyState = 3;
        }
      }

      // @ts-expect-error - test override
      window.WebSocket = MockWebSocket;
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Join Seat 2" }).click();

    await expect(page.getByText("Action Timer")).toBeVisible();
  });
});
