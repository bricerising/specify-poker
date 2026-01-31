import { createServiceBootstrapBuilder, ensureError, runServiceMain } from '@specify-poker/shared';
import { getConfig } from './config';
import { startObservability, stopObservability } from './observability';
import type { EventApp } from './app';
import logger from './observability/logger';

let runningApp: EventApp | null = null;

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

const service = createServiceBootstrapBuilder({ logger, serviceName: 'event' })
  .step('otel.start', async ({ onShutdown }) => {
    // Start OTel before importing instrumented subsystems (pg/redis/grpc/etc.).
    if (isTestEnv()) {
      return;
    }

    await startObservability();
    onShutdown('otel.shutdown', async () => {
      await stopObservability();
    });
  })
  .step('app.start', async ({ onShutdown }) => {
    const { createEventApp } = await import('./app');

    const config = getConfig();
    const app = createEventApp({ config, isTest: isTestEnv() });
    runningApp = app;

    onShutdown('app.stop', async () => {
      const current = runningApp;
      runningApp = null;
      await current?.stop();
    });

    await app.start();
  })
  .build({
    run: async () => {
      logger.info({ port: getConfig().grpcPort }, 'Event Service is running');
    },
    onStartWhileRunning: 'restart',
  });

export async function main(): Promise<void> {
  try {
    await service.main();
  } catch (error: unknown) {
    const ensuredError = ensureError(error);
    logger.error({ err: ensuredError }, 'Failed to start Event Service');
    throw ensuredError;
  }
}

export async function shutdown(): Promise<void> {
  await service.shutdown();
  runningApp = null;
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun && !isTestEnv()) {
  runServiceMain({ logger, main, shutdown });
}
