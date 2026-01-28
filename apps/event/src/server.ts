import { config } from "./config";
import logger from "./observability/logger";
import { createEventApp, type EventApp } from "./app";

let runningApp: EventApp | null = null;

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

export async function main() {
  const isTest = isTestEnv();

  if (runningApp) {
    logger.warn("Event Service is already running; restarting");
    await shutdown();
  }

  const app = createEventApp({ config, isTest });
  try {
    await app.start();
    runningApp = app;
    logger.info({ port: config.grpcPort }, "Event Service is running");
  } catch (error: unknown) {
    logger.error({ err: error }, "Failed to start Event Service");
    await app.stop();
    throw error;
  }
}

export async function shutdown(): Promise<void> {
  const app = runningApp;
  runningApp = null;
  await app?.stop();
}

const isDirectRun =
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  require.main === module;

if (isDirectRun && !isTestEnv()) {
  const handleFatal = (error: unknown) => {
    logger.error({ err: error }, "Event Service failed");
    shutdown().finally(() => process.exit(1));
  };

  process.on("uncaughtException", handleFatal);
  process.on("unhandledRejection", handleFatal);

  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  main().catch(handleFatal);
}
