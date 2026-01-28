import { expect, test } from '@playwright/test';
import WebSocket from 'ws';
import crypto from 'crypto';
import { generateToken } from './helpers/auth';
import { urls, gatewayWsUrl } from './helpers/urls';

async function waitForClose(
  socket: WebSocket,
  timeoutMs = 8000,
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WS close')), timeoutMs);
    socket.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

test.describe('Gateway Auth Boundary (HTTP + WebSocket)', () => {
  test.setTimeout(30_000);

  test('rejects unauthenticated HTTP requests', async ({ request }) => {
    const response = await request.get(`${urls.gateway}/api/tables`);
    expect(response.status()).toBe(401);
  });

  test('rejects invalid bearer tokens', async ({ request }) => {
    const badToken = generateToken('user-bad', 'BadSig', 'wrong-secret');
    const response = await request.get(`${urls.gateway}/api/tables`, {
      headers: { Authorization: `Bearer ${badToken}` },
    });
    expect(response.status()).toBe(401);
  });

  test('accepts valid bearer tokens', async ({ request }) => {
    const token = generateToken('user-good', 'Good');
    const response = await request.get(`${urls.gateway}/api/tables`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as unknown;
    expect(Array.isArray(payload)).toBeTruthy();
  });

  test('enforces JWT auth for WebSocket connections', async () => {
    const forwardedFor = `203.0.113.${Math.floor(Math.random() * 200 + 1)}`;

    const noTokenSocket = new WebSocket(gatewayWsUrl(), {
      headers: { 'X-Forwarded-For': forwardedFor },
    });
    const noTokenClosed = await waitForClose(noTokenSocket);
    expect(noTokenClosed.code).toBe(1008);

    const invalidTokenSocket = new WebSocket(gatewayWsUrl('not-a-jwt'), {
      headers: { 'X-Forwarded-For': forwardedFor },
    });
    const invalidClosed = await waitForClose(invalidTokenSocket);
    expect(invalidClosed.code).toBe(1008);

    const userId = `user-ws-${crypto.randomUUID().slice(0, 8)}`;
    const token = generateToken(userId, 'WsUser');
    const okSocket = new WebSocket(gatewayWsUrl(token), {
      headers: { 'X-Forwarded-For': forwardedFor },
    });
    const welcome = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for Welcome')), 5000);
      okSocket.on('message', (data) => {
        try {
          const parsed: unknown = JSON.parse(data.toString());
          if (
            parsed &&
            typeof parsed === 'object' &&
            (parsed as { type?: unknown }).type === 'Welcome'
          ) {
            clearTimeout(timer);
            resolve(parsed as Record<string, unknown>);
          }
        } catch {
          // ignore
        }
      });
    });

    expect(welcome.userId).toBe(userId);
    expect(typeof welcome.connectionId).toBe('string');

    okSocket.close();
    await waitForClose(okSocket);
  });
});
