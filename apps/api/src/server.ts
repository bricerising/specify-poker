import http from "http";

import express from "express";

import { createRouter } from "./http/router";
import { tracingMiddleware } from "./observability/httpTracing";
import { initApiTelemetry } from "./observability/otel";
import { attachWebSocketServer } from "./ws/server";

export function createApp(options: { useInMemoryTelemetry?: boolean } = {}) {
  initApiTelemetry({ useInMemory: options.useInMemoryTelemetry });

  const app = express();
  app.use(tracingMiddleware);
  app.use(createRouter());

  return app;
}

export function createServer(options: { useInMemoryTelemetry?: boolean } = {}) {
  const app = createApp(options);
  const server = http.createServer(app);
  const wss = attachWebSocketServer(server);
  (server as http.Server & { wss?: ReturnType<typeof attachWebSocketServer> }).wss = wss;
  return server;
}

export const app = createApp();

if (require.main === module) {
  const port = Number(process.env.PORT ?? 4000);
  const server = createServer();
  server.listen(port, () => {
    console.log("api.startup", {
      ts: new Date().toISOString(),
      port,
    });
  });

  const shutdown = (signal: string) => {
    console.log("api.shutdown", { ts: new Date().toISOString(), signal });
    const wss = (server as http.Server & { wss?: ReturnType<typeof attachWebSocketServer> }).wss;
    wss?.close();
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => {
      process.exit(1);
    }, 5000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
