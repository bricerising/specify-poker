import type { Gauge, Histogram } from "prom-client";
import * as promClient from "prom-client";

type MetricMap = Record<string, unknown>;

function getMetricStore(): MetricMap {
  const globalObject = globalThis as unknown as { __specifyPokerGatewayMetrics?: MetricMap };
  if (!globalObject.__specifyPokerGatewayMetrics) {
    globalObject.__specifyPokerGatewayMetrics = {};
  }
  return globalObject.__specifyPokerGatewayMetrics;
}

function getOrCreateMetric<T>(name: string, create: () => T): T | undefined {
  const store = getMetricStore();
  const existing = store[name];
  if (existing) {
    return existing as T;
  }
  try {
    const metric = create();
    store[name] = metric;
    return metric;
  } catch {
    return undefined;
  }
}

const wsActiveConnections =
  "Gauge" in promClient
    ? getOrCreateMetric<Gauge<string>>("gateway_ws_active_connections", () => {
        const GaugeConstructor = (promClient as { Gauge: new (...args: unknown[]) => Gauge<string> }).Gauge;
        const gauge = new GaugeConstructor({
          name: "gateway_ws_active_connections",
          help: "Number of active WebSocket connections.",
          labelNames: ["client_type"],
        });
        gauge.labels("web").set(0);
        gauge.labels("mobile").set(0);
        return gauge;
      })
    : undefined;

const wsSessionDuration =
  "Histogram" in promClient
    ? getOrCreateMetric<Histogram<string>>("gateway_ws_session_duration_seconds", () => {
      const HistogramConstructor = (promClient as { Histogram: new (...args: unknown[]) => Histogram<string> }).Histogram;
      return new HistogramConstructor({
        name: "gateway_ws_session_duration_seconds",
          help: "WebSocket session duration in seconds.",
          labelNames: ["client_type"],
          buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800],
        });
      })
    : undefined;

const httpDuration =
  "Histogram" in promClient
    ? getOrCreateMetric<Histogram<string>>("gateway_http_request_duration_seconds", () => {
      const HistogramConstructor = (promClient as { Histogram: new (...args: unknown[]) => Histogram<string> }).Histogram;
      return new HistogramConstructor({
        name: "gateway_http_request_duration_seconds",
          help: "HTTP request duration in seconds.",
          labelNames: ["method", "route", "status"],
          buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
        });
      })
    : undefined;

export function recordWsConnected(clientType: string) {
  wsActiveConnections?.inc({ client_type: clientType });
}

export function recordWsDisconnected(clientType: string, durationMs?: number) {
  wsActiveConnections?.dec({ client_type: clientType });
  if (durationMs === undefined) {
    return;
  }
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }
  wsSessionDuration?.observe({ client_type: clientType }, durationMs / 1000);
}

export function recordHttpRequest(method: string, route: string, status: number, durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }
  httpDuration?.observe({ method, route, status: String(status) }, durationMs / 1000);
}
