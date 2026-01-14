import type { FullConfig } from "@playwright/test";
import { generateToken } from "./helpers/auth";
import { urls } from "./helpers/urls";

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isStackReady(): Promise<boolean> {
  const health = await fetch(`${urls.gateway}/health`);
  if (!health.ok) return false;

  const ready = await fetch(`${urls.gateway}/ready`);
  if (!ready.ok) return false;

  const token = generateToken("stack-ready", "StackReady");
  const tables = await fetch(`${urls.gateway}/api/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!tables.ok) return false;

  const ui = await fetch(urls.ui);
  if (!ui.ok) return false;

  const keycloak = await fetch(`${urls.keycloak}/realms/poker-local`);
  if (!keycloak.ok) return false;

  const prometheus = await fetch(`${urls.prometheus}/-/ready`);
  if (!prometheus.ok) return false;

  return true;
}

export default async function globalSetup(_config: FullConfig) {
  const useExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL)
    || process.env.PLAYWRIGHT_EXTERNAL === "1";

  if (!useExternalServer || process.env.PLAYWRIGHT_SKIP_STACK_WAIT === "1") {
    return;
  }

  const timeoutMs = Number(process.env.PLAYWRIGHT_STACK_TIMEOUT_MS ?? 120_000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await isStackReady()) {
        return;
      }
    } catch {
      // ignore; continue polling
    }
    await sleep(1000);
  }

  throw new Error(
    `Timed out waiting for docker-compose stack after ${timeoutMs}ms (set PLAYWRIGHT_SKIP_STACK_WAIT=1 to disable).`,
  );
}

