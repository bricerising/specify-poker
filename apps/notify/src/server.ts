import * as dotenv from "dotenv";
dotenv.config();

import { startObservability, stopObservability } from "./observability";
// Start observability before other imports to ensure auto-instrumentation works
startObservability();

import { getConfig } from "./config";
import logger from "./observability/logger";
import { createNotifyApp, type NotifyApp } from "./app";

let runningApp: NotifyApp | null = null;

export async function main() {
  const config = getConfig();

  if (runningApp) {
    logger.warn("Notify Service is already running; restarting");
    await runningApp.stop();
    runningApp = null;
  }

  const app = createNotifyApp({ config });

  try {
    await app.start();
    runningApp = app;

    logger.info({ port: config.grpcPort }, "Notify Service is running");
    return app.services;
  } catch (error) {
    logger.error({ err: error }, "Failed to start Notify Service");
    await app.stop();
    throw error;
  }
}

export async function shutdown() {
  logger.info("Shutting down Notify Service");
  const app = runningApp;
  runningApp = null;
  await app?.stop();
  await stopObservability();
}

if (process.env.NODE_ENV !== "test") {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Notify Service failed");
    process.exit(1);
  };

  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  main().catch(handleFatal);
}
