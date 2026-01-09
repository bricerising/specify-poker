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
  attachWebSocketServer(server);
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
}
