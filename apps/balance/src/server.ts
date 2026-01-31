import {
  createOtelBootstrapStep,
  createServiceBootstrapBuilder,
  runServiceMain,
} from '@specify-poker/shared';
import type { BalanceApp } from './app';
import type { Config } from './config';
import { startObservability, stopObservability } from './observability';
import logger from './observability/logger';

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

type BalanceServiceState = {
  config: Config;
  app: BalanceApp;
};

const service = createServiceBootstrapBuilder({ logger, serviceName: 'balance' })
  // Start OTel before importing instrumented modules (express/http/redis/grpc/etc.).
  .step(
    'otel.start',
    createOtelBootstrapStep({
      isEnabled: () => !isTestEnv(),
      start: startObservability,
      stop: stopObservability,
    }),
  )
  .stepWithState('app.start', async ({ onShutdown }): Promise<BalanceServiceState> => {
    const [{ getConfig }, { createBalanceApp }] = await Promise.all([
      import('./config'),
      import('./app'),
    ]);

    const config = getConfig();

    const app = createBalanceApp({ config });

    onShutdown('app.stop', async () => {
      await app.stop();
    });

    await app.start();

    return { config, app };
  })
  .build({
    run: async ({ state }) => {
      logger.info(
        { httpPort: state.config.httpPort, grpcPort: state.config.grpcPort },
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
  logger.info('Balance service shut down complete');
}

// Only start if this is the main module
if (isDirectRun && !isTestEnv()) {
  runServiceMain({ logger, main: start, shutdown });
}
