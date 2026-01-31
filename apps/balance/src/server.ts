import { createServiceBootstrapBuilder, runServiceMain } from '@specify-poker/shared';
import { startObservability, stopObservability } from './observability';
import type { BalanceApp } from './app';
import type { Config } from './config';
import logger from './observability/logger';

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

let runningApp: BalanceApp | null = null;
let runningConfig: Config | null = null;

const service = createServiceBootstrapBuilder({ logger, serviceName: 'balance' })
  .step('otel.start', async ({ onShutdown }) => {
    // Start OTel before importing instrumented modules (express/http/redis/grpc/etc.).
    if (isTestEnv()) {
      return;
    }

    await startObservability();
    onShutdown('otel.shutdown', async () => {
      await stopObservability();
    });
  })
  .step('app.start', async ({ onShutdown }) => {
    const [{ getConfig }, { createBalanceApp }] = await Promise.all([
      import('./config'),
      import('./app'),
    ]);

    const config = getConfig();
    runningConfig = config;

    const app = createBalanceApp({ config });
    runningApp = app;

    onShutdown('app.stop', async () => {
      const current = runningApp;
      runningApp = null;
      runningConfig = null;
      await current?.stop();
    });

    await app.start();
  })
  .build({
    run: async () => {
      const config = runningConfig;
      if (!config) {
        throw new Error('Balance config is not loaded');
      }
      logger.info(
        { httpPort: config.httpPort, grpcPort: config.grpcPort },
        'Balance Service is running',
      );
    },
    onStartWhileRunning: 'restart',
  });

export async function start() {
  await service.main();
}

export async function shutdown() {
  logger.info('Shutting down balance service...');
  await service.shutdown();
  runningApp = null;
  runningConfig = null;
  logger.info('Balance service shut down complete');
}

// Only start if this is the main module
if (isDirectRun && !isTestEnv()) {
  runServiceMain({ logger, main: start, shutdown });
}
