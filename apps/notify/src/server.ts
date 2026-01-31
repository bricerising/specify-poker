import {
  createOtelBootstrapStep,
  createServiceBootstrapBuilder,
  isTestEnv,
  runServiceMainIfDirectRun,
} from '@specify-poker/shared';
import { getConfig, type Config } from './config';
import logger from './observability/logger';
import { startObservability, stopObservability } from './observability';
import type { NotifyApp } from './app';

type NotifyServiceState = {
  config: Config;
  app: NotifyApp;
};

const service = createServiceBootstrapBuilder({ logger, serviceName: 'notify' })
  // Start OTel before importing instrumented subsystems (grpc, redis, etc.).
  .step(
    'otel.start',
    createOtelBootstrapStep({
      isEnabled: () => !isTestEnv(),
      start: startObservability,
      stop: stopObservability,
    }),
  )
  .stepWithState('app.start', async ({ onShutdown }): Promise<NotifyServiceState> => {
    const config = getConfig();

    const { createNotifyApp } = await import('./app');
    const app = createNotifyApp({ config });
    onShutdown('app.stop', async () => {
      await app.stop();
    });

    await app.start();

    return { config, app };
  })
  .build({
    run: async ({ state }) => {
      logger.info({ port: state.config.grpcPort }, 'Notify Service is running');
      return state.app.services;
    },
  });

export async function main(): Promise<NotifyApp['services']> {
  return service.main();
}

export async function shutdown(): Promise<void> {
  logger.info('Shutting down Notify Service');
  await service.shutdown();
}

const isDirectRun = (): boolean =>
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

runServiceMainIfDirectRun({ logger, main, shutdown, isDirectRun });
