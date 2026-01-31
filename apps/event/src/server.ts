import {
  createOtelBootstrapStep,
  createServiceBootstrapBuilder,
  ensureError,
  runServiceMain,
} from '@specify-poker/shared';
import type { EventApp } from './app';
import { getConfig, type Config } from './config';
import { startObservability, stopObservability } from './observability';
import logger from './observability/logger';

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

type EventServiceState = {
  config: Config;
  app: EventApp;
};

const service = createServiceBootstrapBuilder({ logger, serviceName: 'event' })
  // Start OTel before importing instrumented subsystems (pg/redis/grpc/etc.).
  .step(
    'otel.start',
    createOtelBootstrapStep({
      isEnabled: () => !isTestEnv(),
      start: startObservability,
      stop: stopObservability,
    }),
  )
  .stepWithState('app.start', async ({ onShutdown }): Promise<EventServiceState> => {
    const { createEventApp } = await import('./app');

    const config = getConfig();
    const app = createEventApp({ config, isTest: isTestEnv() });

    onShutdown('app.stop', async () => {
      await app.stop();
    });

    await app.start();

    return { config, app };
  })
  .build({
    run: async ({ state }) => {
      logger.info({ port: state.config.grpcPort }, 'Event Service is running');
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
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun && !isTestEnv()) {
  runServiceMain({ logger, main, shutdown });
}
