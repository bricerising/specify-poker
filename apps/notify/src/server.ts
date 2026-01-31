import { createServiceBootstrapBuilder, runServiceMain } from '@specify-poker/shared';
import { getConfig } from './config';
import logger from './observability/logger';
import { startObservability, stopObservability } from './observability';
import type { NotifyApp } from './app';

let runningApp: NotifyApp | null = null;
const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

const service = createServiceBootstrapBuilder({ logger, serviceName: 'notify' })
  .step('app.stop.register', async ({ onShutdown }) => {
    onShutdown('app.stop', async () => {
      const app = runningApp;
      runningApp = null;
      await app?.stop();
    });
  })
  .step('otel.start', async ({ onShutdown }) => {
    if (isTestEnv()) {
      return;
    }

    // Start OTel before importing instrumented subsystems (grpc, redis, etc.).
    await startObservability();
    onShutdown('otel.shutdown', async () => {
      await stopObservability();
    });
  })
  .step('app.start', async () => {
    const config = getConfig();

    const { createNotifyApp } = await import('./app');
    const app = createNotifyApp({ config });
    runningApp = app;

    await app.start();
  })
  .build({
    run: async () => {
      const config = getConfig();
      const app = runningApp;
      if (!app) {
        throw new Error('Notify app did not start');
      }

      logger.info({ port: config.grpcPort }, 'Notify Service is running');
      return app.services;
    },
  });

export async function main(): Promise<NotifyApp['services']> {
  return service.main();
}

export async function shutdown(): Promise<void> {
  logger.info('Shutting down Notify Service');
  await service.shutdown();
  runningApp = null;
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  runServiceMain({ logger, main, shutdown });
}
