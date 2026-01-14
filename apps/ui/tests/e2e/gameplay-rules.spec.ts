import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import crypto from "crypto";
import { ensureBalance } from "./helpers/balance";
import { generateToken } from "./helpers/auth";
import { authHeaders } from "./helpers/http";
import { urls } from "./helpers/urls";

type TableStateResponse = {
  state?: {
    table_id?: string;
    seats?: Array<{ seat_id?: number; user_id?: string | null; status?: string; stack?: number }>;
    hand?: {
      hand_id?: string;
      street?: string;
      pots?: Array<{ amount?: number | string }>;
      current_bet?: number | string;
      min_raise?: number | string;
      turn?: number;
      actions?: Array<{ type?: string; amount?: number | string }>;
    } | null;
    version?: number;
  };
  hole_cards?: unknown[];
};

function tableIdFrom(created: { table_id?: string; tableId?: string }) {
  return created.table_id ?? created.tableId;
}

async function createTwoPlayerTable(
  request: APIRequestContext,
  options: { smallBlind: number; bigBlind: number; turnTimerSeconds: number },
) {
  const runId = crypto.randomUUID().slice(0, 8);
  const tableName = `E2E Rules ${runId}`;
  const aliceId = `user-a-${runId}`;
  const bobId = `user-b-${runId}`;

  await ensureBalance(aliceId);
  await ensureBalance(bobId);

  const aliceToken = generateToken(aliceId, `Alice${runId}`);
  const bobToken = generateToken(bobId, `Bob${runId}`);

  const create = await request.post(`${urls.gateway}/api/tables`, {
    headers: { ...authHeaders(aliceToken), "Content-Type": "application/json" },
    data: {
      name: tableName,
      config: {
        smallBlind: options.smallBlind,
        bigBlind: options.bigBlind,
        maxPlayers: 2,
        startingStack: 200,
        turnTimerSeconds: options.turnTimerSeconds,
      },
    },
  });
  expect(create.ok()).toBeTruthy();
  const created = (await create.json()) as { table_id?: string; tableId?: string };
  const tableId = tableIdFrom(created);
  expect(tableId).toBeTruthy();

  return {
    tableId: tableId as string,
    tableName,
    aliceId,
    bobId,
    aliceToken,
    bobToken,
  };
}

test.describe("Gameplay Rules (Game + Gateway)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "API-heavy rules checks run once.");
  test.setTimeout(90_000);

  test("rejects joining multiple seats with the same user", async ({ request }) => {
    const runId = crypto.randomUUID().slice(0, 8);
    const tableName = `E2E Single Seat ${runId}`;
    const userId = `user-seat-${runId}`;

    await ensureBalance(userId);
    const token = generateToken(userId, `Seat${runId}`);

    const create = await request.post(`${urls.gateway}/api/tables`, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      data: {
        name: tableName,
        config: {
          smallBlind: 1,
          bigBlind: 2,
          maxPlayers: 9,
          startingStack: 200,
          turnTimerSeconds: 20,
        },
      },
    });
    expect(create.ok()).toBeTruthy();
    const created = (await create.json()) as { table_id?: string; tableId?: string };
    const tableId = tableIdFrom(created);
    expect(tableId).toBeTruthy();

    const joinFirst = await request.post(`${urls.gateway}/api/tables/${tableId}/join`, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      data: { seatId: 0 },
    });
    expect(joinFirst.ok()).toBeTruthy();

    const joinSecond = await request.post(`${urls.gateway}/api/tables/${tableId}/join`, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      data: { seatId: 1 },
    });
    expect(joinSecond.status()).toBe(400);
    const body = (await joinSecond.json()) as { error?: string };
    expect(body.error).toBe("ALREADY_SEATED");
  });

  test("starts hands only with 2+ players and posts blinds", async ({ request }) => {
    const setup = await createTwoPlayerTable(request, { smallBlind: 5, bigBlind: 10, turnTimerSeconds: 20 });

    const joinAlice = await request.post(`${urls.gateway}/api/tables/${setup.tableId}/join`, {
      headers: { ...authHeaders(setup.aliceToken), "Content-Type": "application/json" },
      data: { seatId: 0 },
    });
    expect(joinAlice.ok()).toBeTruthy();

    const stateAfterOne = await request.get(`${urls.gateway}/api/tables/${setup.tableId}/state`, {
      headers: authHeaders(setup.aliceToken),
    });
    const stateAfterOnePayload = (await stateAfterOne.json()) as TableStateResponse;
    expect(stateAfterOnePayload.state?.hand ?? null).toBeNull();

    const joinBob = await request.post(`${urls.gateway}/api/tables/${setup.tableId}/join`, {
      headers: { ...authHeaders(setup.bobToken), "Content-Type": "application/json" },
      data: { seatId: 1 },
    });
    expect(joinBob.ok()).toBeTruthy();

    await expect.poll(async () => {
      const stateRes = await request.get(`${urls.gateway}/api/tables/${setup.tableId}/state`, {
        headers: authHeaders(setup.aliceToken),
      });
      const payload = (await stateRes.json()) as TableStateResponse;
      return payload.state?.hand ?? null;
    }, { timeout: 15_000 }).not.toBeNull();

    const stateRes = await request.get(`${urls.gateway}/api/tables/${setup.tableId}/state`, {
      headers: authHeaders(setup.aliceToken),
    });
    const payload = (await stateRes.json()) as TableStateResponse;
    const hand = payload.state?.hand ?? null;
    expect(hand).not.toBeNull();

    const blindActions = (hand?.actions ?? []).filter((action) => action.type === "POST_BLIND");
    expect(blindActions.length).toBe(2);
    const blindAmounts = blindActions
      .map((action) => Number(action.amount ?? 0))
      .sort((a, b) => a - b);
    expect(blindAmounts).toEqual([5, 10]);
    expect(Number(hand?.current_bet ?? 0)).toBe(10);
    expect(Number(hand?.min_raise ?? 0)).toBe(10);
    expect((hand?.pots ?? []).reduce((sum, pot) => sum + Number(pot.amount ?? 0), 0)).toBe(15);

    expect((payload.hole_cards ?? []).length).toBe(2);
  });

  test("rejects out-of-turn actions with NOT_YOUR_TURN", async ({ request }) => {
    const setup = await createTwoPlayerTable(request, { smallBlind: 1, bigBlind: 2, turnTimerSeconds: 20 });

    const joinAlice = await request.post(`${urls.gateway}/api/tables/${setup.tableId}/join`, {
      headers: { ...authHeaders(setup.aliceToken), "Content-Type": "application/json" },
      data: { seatId: 0 },
    });
    expect(joinAlice.ok()).toBeTruthy();

    const joinBob = await request.post(`${urls.gateway}/api/tables/${setup.tableId}/join`, {
      headers: { ...authHeaders(setup.bobToken), "Content-Type": "application/json" },
      data: { seatId: 1 },
    });
    expect(joinBob.ok()).toBeTruthy();

    await expect.poll(async () => {
      const stateRes = await request.get(`${urls.gateway}/api/tables/${setup.tableId}/state`, {
        headers: authHeaders(setup.aliceToken),
      });
      const payload = (await stateRes.json()) as TableStateResponse;
      return Boolean(payload.state?.hand);
    }, { timeout: 15_000 }).toBe(true);

    const stateRes = await request.get(`${urls.gateway}/api/tables/${setup.tableId}/state`, {
      headers: authHeaders(setup.aliceToken),
    });
    const payload = (await stateRes.json()) as TableStateResponse;
    const hand = payload.state?.hand;
    expect(hand).toBeTruthy();

    const currentTurnSeat = hand?.turn;
    expect(typeof currentTurnSeat).toBe("number");
    const seats = payload.state?.seats ?? [];
    const nonTurnSeat = seats.find((seat) => seat.seat_id !== currentTurnSeat);
    expect(nonTurnSeat?.user_id).toBeTruthy();

    const actorUserId = nonTurnSeat?.user_id as string;
    const actorToken = actorUserId === setup.aliceId ? setup.aliceToken : setup.bobToken;

    const actionRes = await request.post(`${urls.gateway}/api/tables/${setup.tableId}/action`, {
      headers: { ...authHeaders(actorToken), "Content-Type": "application/json" },
      data: { actionType: "CHECK" },
    });
    expect(actionRes.status()).toBe(400);
    const body = (await actionRes.json()) as { error?: string };
    expect(body.error).toBe("NOT_YOUR_TURN");
  });

  test("turn timers trigger auto-action events", async ({ request }) => {
    const setup = await createTwoPlayerTable(request, { smallBlind: 1, bigBlind: 2, turnTimerSeconds: 1 });

    const joinAlice = await request.post(`${urls.gateway}/api/tables/${setup.tableId}/join`, {
      headers: { ...authHeaders(setup.aliceToken), "Content-Type": "application/json" },
      data: { seatId: 0 },
    });
    expect(joinAlice.ok()).toBeTruthy();

    const joinBob = await request.post(`${urls.gateway}/api/tables/${setup.tableId}/join`, {
      headers: { ...authHeaders(setup.bobToken), "Content-Type": "application/json" },
      data: { seatId: 1 },
    });
    expect(joinBob.ok()).toBeTruthy();

    await expect.poll(async () => {
      const stateRes = await request.get(`${urls.gateway}/api/tables/${setup.tableId}/state`, {
        headers: authHeaders(setup.aliceToken),
      });
      const payload = (await stateRes.json()) as TableStateResponse;
      return Boolean(payload.state?.hand);
    }, { timeout: 15_000 }).toBe(true);

    await expect.poll(async () => {
      const eventsRes = await request.get(`${urls.gateway}/api/audit/events?tableId=${setup.tableId}&limit=100`, {
        headers: authHeaders(setup.aliceToken),
      });
      const payload = (await eventsRes.json()) as { events?: Array<{ type?: string }> };
      const types = payload.events?.map((event) => event.type) ?? [];
      return types.some((type) => type === "FOLD" || type === "CHECK");
    }, { timeout: 20_000 }).toBe(true);
  });
});
