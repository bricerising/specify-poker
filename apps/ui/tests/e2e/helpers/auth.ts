import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
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

let cachedHs256Secret: string | null = null;

function findRepoEnvPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '..', '.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readDotEnvValue(envPath: string, key: string): string | null {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const currentKey = match[1] ?? null;
    if (currentKey !== key) {
      continue;
    }

    const value = (match[2] ?? '').trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

function getDefaultHs256Secret(): string {
  if (cachedHs256Secret) {
    return cachedHs256Secret;
  }

  const fromEnv =
    process.env.PLAYWRIGHT_JWT_HS256_SECRET?.trim() ?? process.env.JWT_HS256_SECRET?.trim() ?? null;
  if (fromEnv) {
    cachedHs256Secret = fromEnv;
    return fromEnv;
  }

  const envPath = findRepoEnvPath();
  if (envPath) {
    const fromDotEnv = readDotEnvValue(envPath, 'JWT_HS256_SECRET');
    if (fromDotEnv) {
      cachedHs256Secret = fromDotEnv;
      return fromDotEnv;
    }
  }

  throw new Error(
    'Missing HS256 secret for E2E tokens. Set JWT_HS256_SECRET in your environment (or .env), set PLAYWRIGHT_JWT_HS256_SECRET for Playwright, or run `npm run env:local` from the repo root to generate a local `.env`.',
  );
}

export function generateToken(
  userId: string,
  username: string,
  secret = getDefaultHs256Secret(),
): string {
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
