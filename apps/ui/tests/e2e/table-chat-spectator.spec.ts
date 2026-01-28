import { expect, test } from '@playwright/test';
import crypto from 'crypto';
import { loginAs, generateToken } from './helpers/auth';
import { ensureBalance } from './helpers/balance';
import { authHeaders } from './helpers/http';
import { connectWs } from './helpers/ws';
import { gatewayWsUrl, urls } from './helpers/urls';

test.describe('Tables: spectator + chat + moderation', () => {
  test.setTimeout(90_000);

  test('players can chat; owner can mute; spectators can watch and chat', async ({ browser }) => {
    const runId = crypto.randomUUID().slice(0, 8);
    const tableName = `E2E Spectate ${runId}`;
    const aliceId = `user-alice-${runId}`;
    const bobId = `user-bob-${runId}`;
    const spectatorId = `user-spec-${runId}`;

    await ensureBalance(aliceId);
    await ensureBalance(bobId);

    const contextAlice = await browser.newContext();
    const pageAlice = await contextAlice.newPage();
    await loginAs(pageAlice, aliceId, `Alice${runId}`);

    await pageAlice.getByTestId('create-table-name').fill(tableName);
    await pageAlice.getByTestId('create-table-submit').click();
    const tableCardAlice = pageAlice.getByTestId('lobby-table-card').filter({ hasText: tableName });
    await expect(tableCardAlice).toBeVisible({ timeout: 15_000 });
    await tableCardAlice.locator('[data-testid="lobby-join-seat"][data-seat-number="1"]').click();
    await expect(pageAlice.getByText('Table ID:')).toBeVisible({ timeout: 15_000 });

    const contextBob = await browser.newContext();
    const pageBob = await contextBob.newPage();
    await loginAs(pageBob, bobId, `Bob${runId}`);

    const tableCardBob = pageBob.getByTestId('lobby-table-card').filter({ hasText: tableName });
    await expect(tableCardBob).toBeVisible({ timeout: 15_000 });
    await tableCardBob.locator('[data-testid="lobby-join-seat"][data-seat-number="2"]').click();
    await expect(pageBob.getByText('Table ID:')).toBeVisible({ timeout: 15_000 });

    const contextSpectator = await browser.newContext();
    const pageSpectator = await contextSpectator.newPage();
    await loginAs(pageSpectator, spectatorId, `Spec${runId}`);

    const tableCardSpectator = pageSpectator
      .getByTestId('lobby-table-card')
      .filter({ hasText: tableName });
    await expect(tableCardSpectator).toBeVisible({ timeout: 15_000 });
    await tableCardSpectator.getByTestId('lobby-watch-table').click();
    await expect(pageSpectator.getByText('Table ID:')).toBeVisible({ timeout: 15_000 });

    // Spectator should see card backs, not hole card faces.
    await expect(pageSpectator.locator('.seat-cards .playing-card')).toHaveCount(0);
    await expect(pageSpectator.locator('.seat-cards .card-back')).toHaveCount(4);

    await pageAlice.getByTestId('chat-message').fill('hello from alice');
    await pageAlice.getByTestId('chat-send').click();

    await expect(pageBob.getByText('hello from alice')).toBeVisible({ timeout: 10_000 });
    await expect(pageSpectator.getByText('hello from alice')).toBeVisible({ timeout: 10_000 });

    // Owner mutes Bob via moderation menu.
    await expect(
      pageAlice.locator('[data-testid="moderation-mute"][data-seat-number="2"]'),
    ).toBeVisible();
    await pageAlice.locator('[data-testid="moderation-mute"][data-seat-number="2"]').click();

    await pageBob.getByTestId('chat-message').fill('bob should be muted');
    await pageBob.getByTestId('chat-send').click();
    await expect(pageBob.getByRole('alert')).toContainText('muted');

    await pageSpectator.getByTestId('chat-message').fill('spectator chat ok');
    await pageSpectator.getByTestId('chat-send').click();
    await expect(pageAlice.getByText('spectator chat ok')).toBeVisible({ timeout: 10_000 });

    await contextAlice.close();
    await contextBob.close();
    await contextSpectator.close();
  });

  test('spectators never receive HoleCards over WebSocket', async ({ browserName, request }) => {
    test.skip(browserName !== 'chromium', 'WS protocol assertions run once.');

    const runId = crypto.randomUUID().slice(0, 8);
    const tableName = `E2E Holecards ${runId}`;
    const aliceId = `user-ws-alice-${runId}`;
    const bobId = `user-ws-bob-${runId}`;
    const spectatorId = `user-ws-spec-${runId}`;

    const aliceToken = generateToken(aliceId, 'Alice');
    const bobToken = generateToken(bobId, 'Bob');
    const spectatorToken = generateToken(spectatorId, 'Spec');

    await ensureBalance(aliceId);
    await ensureBalance(bobId);

    const createTableResponse = await request.post(`${urls.gateway}/api/tables`, {
      headers: { ...authHeaders(aliceToken), 'Content-Type': 'application/json' },
      data: {
        name: tableName,
        config: {
          smallBlind: 1,
          bigBlind: 2,
          maxPlayers: 2,
          startingStack: 200,
          turnTimerSeconds: 5,
        },
      },
    });
    expect(createTableResponse.ok()).toBeTruthy();
    const created = (await createTableResponse.json()) as { table_id?: string; tableId?: string };
    const tableId = created.table_id ?? created.tableId;
    expect(tableId).toBeTruthy();

    const joinAlice = await request.post(`${urls.gateway}/api/tables/${tableId}/join`, {
      headers: { ...authHeaders(aliceToken), 'Content-Type': 'application/json' },
      data: { seatId: 0 },
    });
    expect(joinAlice.ok()).toBeTruthy();

    const joinBob = await request.post(`${urls.gateway}/api/tables/${tableId}/join`, {
      headers: { ...authHeaders(bobToken), 'Content-Type': 'application/json' },
      data: { seatId: 1 },
    });
    expect(joinBob.ok()).toBeTruthy();

    await expect
      .poll(
        async () => {
          const stateRes = await request.get(`${urls.gateway}/api/tables/${tableId}/state`, {
            headers: authHeaders(aliceToken),
          });
          const payload = (await stateRes.json()) as { state?: { hand?: unknown } };
          return Boolean(payload.state?.hand);
        },
        { timeout: 15_000 },
      )
      .toBe(true);

    const aliceWs = await connectWs(gatewayWsUrl(aliceToken), {
      headers: { 'X-Forwarded-For': '203.0.113.10' },
    });
    const bobWs = await connectWs(gatewayWsUrl(bobToken), {
      headers: { 'X-Forwarded-For': '203.0.113.11' },
    });
    const spectatorWs = await connectWs(gatewayWsUrl(spectatorToken), {
      headers: { 'X-Forwarded-For': '203.0.113.12' },
    });

    aliceWs.send({ type: 'SubscribeTable', tableId });
    bobWs.send({ type: 'SubscribeTable', tableId });
    spectatorWs.send({ type: 'SubscribeTable', tableId });

    await aliceWs.waitForMessage((message) => message.type === 'HoleCards', 10_000);
    await bobWs.waitForMessage((message) => message.type === 'HoleCards', 10_000);

    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(spectatorWs.messages.some((message) => message.type === 'HoleCards')).toBe(false);

    await aliceWs.close();
    await bobWs.close();
    await spectatorWs.close();
  });
});
