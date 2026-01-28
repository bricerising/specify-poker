import { startObservability, stopObservability } from './observability';
import { runServiceMain } from '@specify-poker/shared';
import type { BalanceApp } from './app';

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

const isTestEnv = process.env.NODE_ENV === 'test';

import logger from './observability/logger';

let runningApp: BalanceApp | null = null;

async function getOrCreateApp(): Promise<BalanceApp> {
  if (runningApp) {
    return runningApp;
  }

  const [{ getConfig }, { createBalanceApp }] = await Promise.all([
    import('./config'),
    import('./app'),
  ]);

  runningApp = createBalanceApp({
    config: getConfig(),
    stopObservability: isTestEnv ? undefined : stopObservability,
  });

  return runningApp;
}

export async function start() {
  if (!isTestEnv) {
    // Start OTel before importing instrumented modules (express/http/redis/grpc/etc.).
    startObservability();
  }
  await (await getOrCreateApp()).start();
}

export async function shutdown() {
  logger.info('Shutting down balance service...');
  const app = runningApp;
  runningApp = null;
  await app?.stop();
  logger.info('Balance service shut down complete');
}

// Only start if this is the main module
if (isDirectRun && !isTestEnv) {
  runServiceMain({ logger, main: start, shutdown });
}
