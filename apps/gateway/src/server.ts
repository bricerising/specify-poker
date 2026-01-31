import {
  createServiceBootstrapBuilder,
  runServiceMain,
} from '@specify-poker/shared';
import logger from './observability/logger';
import { initOTEL, shutdownOTEL } from './observability/otel';
import type { GatewayApp } from './app';

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test';

let runningApp: GatewayApp | null = null;

const service = createServiceBootstrapBuilder({ logger, serviceName: 'gateway' })
  .step('otel.init', async ({ onShutdown }) => {
    // Initialize OpenTelemetry before importing instrumented modules (http/express/ws/redis/etc.).
    if (isTestEnv()) {
      return;
    }

    initOTEL();
    onShutdown('otel.shutdown', async () => {
      await shutdownOTEL();
    });
  })
  .step('app.start', async ({ onShutdown }) => {
    const [{ getConfig }, { createGatewayApp }] = await Promise.all([
      import('./config'),
      import('./app'),
    ]);

    const config = getConfig();

    const app = createGatewayApp({ config });
    runningApp = app;

    onShutdown('app.stop', async () => {
      const current = runningApp;
      runningApp = null;
      await current?.stop();
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
  runningApp = null;
}

if (isDirectRun && !isTestEnv()) {
  runServiceMain({ logger, main: startServer, shutdown });
}
