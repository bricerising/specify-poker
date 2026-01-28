import crypto from 'crypto';
import type { Page } from '@playwright/test';

function base64Url(input: string | Buffer): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sign(data: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  return base64Url(hmac.digest());
}

export function generateToken(userId: string, username: string, secret = 'default-secret'): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    preferred_username: username,
    iss: 'poker-gateway',
    aud: 'poker-ui',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function loginAs(page: Page, userId: string, username: string) {
  const token = generateToken(userId, username);
  await page.addInitScript((val) => {
    window.sessionStorage.setItem('poker.auth.token', val);
  }, token);
  await page.goto('/');
}

export async function setNickname(userId: string, username: string, nickname: string) {
  const token = generateToken(userId, username);
  const res = await fetch('http://localhost:4000/api/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ nickname }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to set nickname: ${res.status} ${text}`);
  }
}
