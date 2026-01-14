import http from "http";
import client, { Counter, Gauge, Histogram, Registry } from "prom-client";
import logger from "./logger";

const registry = new Registry();

client.collectDefaultMetrics({ register: registry });

const httpDuration = new Histogram({
  name: "balance_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [registry],
});

const grpcDuration = new Histogram({
  name: "balance_grpc_request_duration_seconds",
  help: "gRPC request duration in seconds.",
  labelNames: ["method", "status"],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [registry],
});

const transactionCounter = new Counter({
  name: "balance_transactions_total",
  help: "Total balance transactions processed.",
  labelNames: ["type", "direction"],
  registers: [registry],
});

const sourceCounter = new Counter({
  name: "balance_sources_chips_total",
  help: "Total chips added to the economy by source type.",
  labelNames: ["type"],
  registers: [registry],
});

const sinkCounter = new Counter({
  name: "balance_sinks_chips_total",
  help: "Total chips removed from the economy by sink type.",
  labelNames: ["type"],
  registers: [registry],
});

const velocityCounter = new Counter({
  name: "balance_velocity_chips_total",
  help: "Total chips moved through pots (bet velocity).",
  labelNames: ["action"],
  registers: [registry],
});

const totalSupplyGauge = new Gauge({
  name: "balance_total_supply",
  help: "Total supply across accounts plus active pots.",
  registers: [registry],
});

const totalPotGauge = new Gauge({
  name: "balance_active_pot_total",
  help: "Total chips locked in active pots.",
  registers: [registry],
});

let totalAccountBalance = 0;
let totalPotBalance = 0;

function updateSupplyGauge() {
  totalSupplyGauge.set(totalAccountBalance + totalPotBalance);
  totalPotGauge.set(totalPotBalance);
}

export function recordHttpRequest(method: string, route: string, status: number, durationMs: number) {
  httpDuration.observe({ method, route, status: String(status) }, durationMs / 1000);
}

export function recordGrpcRequest(method: string, status: "ok" | "error", durationMs: number) {
  grpcDuration.observe({ method, status }, durationMs / 1000);
}

export function recordAccountDelta(type: string, direction: "credit" | "debit", amount: number) {
  transactionCounter.inc({ type, direction });
  totalAccountBalance += direction === "credit" ? amount : -amount;
  updateSupplyGauge();

  if (direction === "credit" && ["DEPOSIT", "BONUS", "REFERRAL"].includes(type)) {
    sourceCounter.inc({ type }, amount);
  }
  if (direction === "debit" && ["WITHDRAW", "RAKE"].includes(type)) {
    sinkCounter.inc({ type }, amount);
  }
}

export function recordPotContribution(amount: number) {
  totalPotBalance += amount;
  velocityCounter.inc({ action: "bet" }, amount);
  updateSupplyGauge();
}

export function recordPotSettlement(totalPot: number, rakeAmount: number) {
  totalPotBalance = Math.max(0, totalPotBalance - totalPot);
  if (rakeAmount > 0) {
    sinkCounter.inc({ type: "RAKE" }, rakeAmount);
  }
  updateSupplyGauge();
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
    logger.info({ port }, "Balance metrics server listening");
  });

  return server;
}
