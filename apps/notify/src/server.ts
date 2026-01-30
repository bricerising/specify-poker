import { createShutdownManager, runServiceMain, type ShutdownManager } from '@specify-poker/shared';
import { getConfig } from './config';
import logger from './observability/logger';
import { startObservability, stopObservability } from './observability';
import { toError } from './shared/errors';
import type { NotifyApp } from './app';

let runningApp: NotifyApp | null = null;
let runningShutdown: ShutdownManager | null = null;

export async function main(): Promise<NotifyApp['services']> {
  const isTestEnv = process.env.NODE_ENV === 'test';

  if (runningApp) {
    logger.warn('Notify Service is already running; restarting');
    await shutdown();
  }

  const shutdownManager = createShutdownManager({ logger });
  runningShutdown = shutdownManager;
  shutdownManager.add('otel.shutdown', async () => {
    if (!isTestEnv) {
      await stopObservability();
    }
  });
  shutdownManager.add('app.stop', async () => {
    const app = runningApp;
    runningApp = null;
    await app?.stop();
  });

  try {
    if (!isTestEnv) {
      // Start OTel before importing instrumented subsystems (grpc, redis, etc.).
      await startObservability();
    }

    const config = getConfig();

    const { createNotifyApp } = await import('./app');
    const app = createNotifyApp({ config });
    runningApp = app;

    await app.start();

    logger.info({ port: config.grpcPort }, 'Notify Service is running');
    return app.services;
  } catch (error: unknown) {
    logger.error({ err: toError(error) }, 'Failed to start Notify Service');
    await shutdownManager.run();
    runningShutdown = null;
    throw error;
  }
}

export async function shutdown(): Promise<void> {
  logger.info('Shutting down Notify Service');
  await runningShutdown?.run();
  runningShutdown = null;
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  runServiceMain({ logger, main, shutdown });
}
