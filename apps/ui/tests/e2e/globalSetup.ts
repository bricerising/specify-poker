import type { FullConfig } from '@playwright/test';
import { generateToken } from './helpers/auth';
import { urls } from './helpers/urls';

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type StackReadyResult = { ok: true } | { ok: false; reason: string };

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function checkOk(
  name: string,
  url: string,
  init?: RequestInit,
): Promise<StackReadyResult> {
  const res = await fetch(url, init);
  if (res.ok) {
    return { ok: true };
  }

  const statusText = res.statusText ? ` ${res.statusText}` : '';
  return { ok: false, reason: `${name} returned ${res.status}${statusText}` };
}

async function isStackReady(): Promise<StackReadyResult> {
  const health = await checkOk('gateway /health', `${urls.gateway}/health`);
  if (!health.ok) return health;

  const ready = await checkOk('gateway /ready', `${urls.gateway}/ready`);
  if (!ready.ok) return ready;

  const token = generateToken('stack-ready', 'StackReady');
  const tables = await checkOk('gateway /api/tables', `${urls.gateway}/api/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!tables.ok) return tables;

  const ui = await checkOk('ui', urls.ui);
  if (!ui.ok) return ui;

  const keycloak = await checkOk('keycloak realm', `${urls.keycloak}/realms/poker-local`);
  if (!keycloak.ok) return keycloak;

  const mimir = await checkOk('mimir buildinfo', `${urls.mimir}/prometheus/api/v1/status/buildinfo`);
  if (!mimir.ok) return mimir;

  const loki = await checkOk('loki /ready', `${urls.loki}/ready`);
  if (!loki.ok) return loki;

  const tempo = await checkOk('tempo /ready', `${urls.tempo}/ready`);
  if (!tempo.ok) return tempo;

  return { ok: true };
}

export default async function globalSetup(_config: FullConfig) {
  const useExternalServer =
    Boolean(process.env.PLAYWRIGHT_BASE_URL) ||
    process.env.PLAYWRIGHT_EXTERNAL === '1' ||
    Boolean(process.env.CI);

  if (!useExternalServer || process.env.PLAYWRIGHT_SKIP_STACK_WAIT === '1') {
    return;
  }

  const timeoutMs = Number(process.env.PLAYWRIGHT_STACK_TIMEOUT_MS ?? 120_000);
  const startedAt = Date.now();
  let lastFailure: StackReadyResult | null = null;
  let lastError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const ready = await isStackReady();
      if (ready.ok) {
        return;
      }
      lastFailure = ready;
    } catch (error) {
      lastError = error;
      if (
        error instanceof Error &&
        error.message.startsWith('Missing HS256 secret for E2E tokens')
      ) {
        throw error;
      }
    }
    await sleep(1000);
  }

  const debugInfo = [
    lastFailure?.ok === false ? `Last failure: ${lastFailure.reason}` : null,
    lastError ? `Last error: ${formatUnknownError(lastError)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const suffix = debugInfo.length > 0 ? `\n\n${debugInfo}` : '';

  throw new Error(
    `Timed out waiting for docker-compose stack after ${timeoutMs}ms (set PLAYWRIGHT_SKIP_STACK_WAIT=1 to disable).${suffix}`,
  );
}
