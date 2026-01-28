import { startObservability, stopObservability } from "./observability";
const isDirectRun =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;

if (isDirectRun) {
  startObservability();
}

import { getConfig } from "./config";
import { createBalanceApp, type BalanceApp } from "./app";
import logger from "./observability/logger";

let runningApp: BalanceApp | null = null;

function getOrCreateApp(): BalanceApp {
  if (runningApp) {
    return runningApp;
  }

  runningApp = createBalanceApp({
    config: getConfig(),
    stopObservability: isDirectRun ? stopObservability : undefined,
  });

  return runningApp;
}

export async function start() {
  await getOrCreateApp().start();
}

export async function shutdown() {
  logger.info("Shutting down balance service...");
  const app = runningApp;
  runningApp = null;
  await app?.stop();
  logger.info("Balance service shut down complete");
}

// Only start if this is the main module
if (isDirectRun) {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Balance service failed");
    shutdown().finally(() => process.exit(1));
  };

  process.on("uncaughtException", handleFatal);
  process.on("unhandledRejection", handleFatal);

  // Handle shutdown signals
  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  // Start the service
  start().catch(handleFatal);
}

export const app = getOrCreateApp().expressApp;
