import { expect, test } from '@playwright/test';
import crypto from 'crypto';
import { ensureBalance } from './helpers/balance';
import { generateToken } from './helpers/auth';
import { gatewayJson } from './helpers/http';
import { botProfiles, PokerTestBot, playHandsWithBots } from './helpers/pokerBot';

function tableIdFrom(created: { table_id?: string; tableId?: string }) {
  return created.table_id ?? created.tableId;
}

function requireTableId(created: { table_id?: string; tableId?: string }, label: string): string {
  const tableId = tableIdFrom(created);
  if (!tableId) {
    throw new Error(`Expected ${label} tableId to be returned`);
  }
  return tableId;
}

test.describe('Poker bots (integration)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'API-heavy bot simulation runs once.');
  test.setTimeout(120_000);

  test('tables can play a few hands with mixed bot profiles', async ({ request }) => {
    const runId = crypto.randomUUID().slice(0, 8);

    const aliceId = `bot-a-${runId}`;
    const bobId = `bot-b-${runId}`;
    const carolId = `bot-c-${runId}`;
    const danId = `bot-d-${runId}`;
    const eveId = `bot-e-${runId}`;

    await Promise.all([
      ensureBalance(aliceId),
      ensureBalance(bobId),
      ensureBalance(carolId),
      ensureBalance(danId),
      ensureBalance(eveId),
    ]);

    const aliceToken = generateToken(aliceId, `Alice${runId}`);
    const bobToken = generateToken(bobId, `Bob${runId}`);
    const carolToken = generateToken(carolId, `Carol${runId}`);
    const danToken = generateToken(danId, `Dan${runId}`);
    const eveToken = generateToken(eveId, `Eve${runId}`);

    const headsUpName = `E2E Bots HU ${runId}`;
    const ringName = `E2E Bots Ring ${runId}`;

    const headsUpCreated = await gatewayJson<{ table_id?: string; tableId?: string }>(
      request,
      '/api/tables',
      {
        token: aliceToken,
        method: 'POST',
        data: {
          name: headsUpName,
          config: {
            smallBlind: 1,
            bigBlind: 2,
            maxPlayers: 2,
            startingStack: 500,
            turnTimerSeconds: 3,
          },
        },
      },
    );
    const headsUpTableId = requireTableId(headsUpCreated, 'heads-up');

    const ringCreated = await gatewayJson<{ table_id?: string; tableId?: string }>(
      request,
      '/api/tables',
      {
        token: carolToken,
        method: 'POST',
        data: {
          name: ringName,
          config: {
            smallBlind: 2,
            bigBlind: 4,
            maxPlayers: 3,
            startingStack: 500,
            turnTimerSeconds: 3,
          },
        },
      },
    );
    const ringTableId = requireTableId(ringCreated, 'ring');

    await Promise.all([
      gatewayJson<{ ok: boolean }>(request, `/api/tables/${headsUpTableId}/join`, {
        token: aliceToken,
        method: 'POST',
        data: { seatId: 0 },
      }),
      gatewayJson<{ ok: boolean }>(request, `/api/tables/${headsUpTableId}/join`, {
        token: bobToken,
        method: 'POST',
        data: { seatId: 1 },
      }),
      gatewayJson<{ ok: boolean }>(request, `/api/tables/${ringTableId}/join`, {
        token: carolToken,
        method: 'POST',
        data: { seatId: 0 },
      }),
      gatewayJson<{ ok: boolean }>(request, `/api/tables/${ringTableId}/join`, {
        token: danToken,
        method: 'POST',
        data: { seatId: 1 },
      }),
      gatewayJson<{ ok: boolean }>(request, `/api/tables/${ringTableId}/join`, {
        token: eveToken,
        method: 'POST',
        data: { seatId: 2 },
      }),
    ]);

    const huBots = [
      new PokerTestBot({
        userId: aliceId,
        username: `Alice${runId}`,
        token: aliceToken,
        seatId: 0,
        profile: botProfiles.tightAggressive,
      }),
      new PokerTestBot({
        userId: bobId,
        username: `Bob${runId}`,
        token: bobToken,
        seatId: 1,
        profile: botProfiles.looseAggressive,
      }),
    ];

    const ringBots = [
      new PokerTestBot({
        userId: carolId,
        username: `Carol${runId}`,
        token: carolToken,
        seatId: 0,
        profile: botProfiles.tightPassive,
      }),
      new PokerTestBot({
        userId: danId,
        username: `Dan${runId}`,
        token: danToken,
        seatId: 1,
        profile: botProfiles.tightAggressive,
      }),
      new PokerTestBot({
        userId: eveId,
        username: `Eve${runId}`,
        token: eveToken,
        seatId: 2,
        profile: botProfiles.maniac,
      }),
    ];

    const [huResult, ringResult] = await Promise.all([
      playHandsWithBots(request, {
        tableId: headsUpTableId,
        bots: huBots,
        handsToComplete: 2,
        timeoutMs: 60_000,
      }),
      playHandsWithBots(request, {
        tableId: ringTableId,
        bots: ringBots,
        handsToComplete: 2,
        timeoutMs: 60_000,
      }),
    ]);

    expect(huResult.handsCompleted).toBeGreaterThanOrEqual(2);
    expect(ringResult.handsCompleted).toBeGreaterThanOrEqual(2);

    const tablesResponse = await gatewayJson<Array<{ table_id?: string; tableId?: string; name?: string }>>(
      request,
      '/api/tables',
      {
        token: aliceToken,
      },
    );

    const liveIds = new Set(
      tablesResponse.map((table) => tableIdFrom(table)).filter((id): id is string => Boolean(id)),
    );
    expect(liveIds.has(headsUpTableId)).toBe(true);
    expect(liveIds.has(ringTableId)).toBe(true);

    // Sanity: the tables should still be reachable after simulated play.
    await gatewayJson<{ state?: unknown }>(request, `/api/tables/${headsUpTableId}/state`, {
      token: aliceToken,
    });
    await gatewayJson<{ state?: unknown }>(request, `/api/tables/${ringTableId}/state`, {
      token: carolToken,
    });
  });
});
