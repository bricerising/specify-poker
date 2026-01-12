import http from "http";
import client, { Counter, Histogram, Registry } from "prom-client";
import logger from "./logger";

const registry = new Registry();

client.collectDefaultMetrics({ register: registry });

const ingestionCounter = new Counter({
  name: "event_ingestion_total",
  help: "Total events ingested.",
  labelNames: ["type"],
  registers: [registry],
});

const queryDuration = new Histogram({
  name: "event_query_duration_seconds",
  help: "Event query durations in seconds.",
  labelNames: ["status"],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2],
  registers: [registry],
});

const materializationLag = new Histogram({
  name: "event_hand_materialization_lag_seconds",
  help: "Lag between hand completion and materialization.",
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export function recordIngestion(type: string) {
  ingestionCounter.inc({ type });
}

export function recordQueryDuration(status: "ok" | "error", durationMs: number) {
  queryDuration.observe({ status }, durationMs / 1000);
}

export function recordMaterializationLag(durationMs: number) {
  materializationLag.observe(durationMs / 1000);
}

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export function startMetricsServer(port: number): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/metrics") {
      res.statusCode = 200;
      res.setHeader("Content-Type", registry.contentType);
      res.end(await renderMetrics());
      return;
    }
    res.statusCode = 404;
    res.end("Not Found");
  });

  server.listen(port, () => {
    logger.info({ port }, "Event metrics server listening");
  });

  return server;
}
