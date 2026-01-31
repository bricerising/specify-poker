import {
  createOtelBootstrapStep,
  createServiceBootstrapBuilder,
  isTestEnv,
  runServiceMainIfDirectRun,
} from '@specify-poker/shared';
import logger from './observability/logger';
import { initOTEL, shutdownOTEL } from './observability/otel';

const service = createServiceBootstrapBuilder({ logger, serviceName: 'gateway' })
  // Initialize OpenTelemetry before importing instrumented modules (http/express/ws/redis/etc.).
  .step(
    'otel.init',
    createOtelBootstrapStep({
      isEnabled: () => !isTestEnv(),
      start: initOTEL,
      stop: shutdownOTEL,
    }),
  )
  .step('app.start', async ({ onShutdown }) => {
    const [{ getConfig }, { createGatewayApp }] = await Promise.all([
      import('./config'),
      import('./app'),
    ]);

    const config = getConfig();

    const app = createGatewayApp({ config });

    onShutdown('app.stop', async () => {
      await app.stop();
    });

    await app.start();
  })
  .build({
    run: async () => {},
    onStartWhileRunning: 'throw',
  });

export async function startServer(): Promise<void> {
  await service.main();
}

export async function shutdown(): Promise<void> {
  await service.shutdown();
}

const isDirectRun = (): boolean =>
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

runServiceMainIfDirectRun({ logger, main: startServer, shutdown, isDirectRun });
