import { startPrometheusMetricsServer } from '@specify-poker/shared';
import type { Server } from 'http';
import client, { Counter, Histogram, Registry } from 'prom-client';
import logger from './logger';

const registry = new Registry();

client.collectDefaultMetrics({ register: registry });

const ingestionCounter = new Counter({
  name: 'event_ingestion_total',
  help: 'Total events ingested.',
  labelNames: ['type'],
  registers: [registry],
});

const queryDuration = new Histogram({
  name: 'event_query_duration_seconds',
  help: 'Event query durations in seconds.',
  labelNames: ['status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2],
  registers: [registry],
});

const grpcDuration = new Histogram({
  name: 'event_grpc_request_duration_seconds',
  help: 'gRPC request duration in seconds.',
  labelNames: ['method', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [registry],
});

const materializationLag = new Histogram({
  name: 'event_hand_materialization_lag_seconds',
  help: 'Lag between hand completion and materialization.',
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export function recordIngestion(type: string) {
  ingestionCounter.inc({ type });
}

export function recordQueryDuration(status: 'ok' | 'error', durationMs: number) {
  queryDuration.observe({ status }, durationMs / 1000);
}

export function recordGrpcRequest(method: string, status: 'ok' | 'error', durationMs: number) {
  grpcDuration.observe({ method, status }, durationMs / 1000);
}

export function recordMaterializationLag(durationMs: number) {
  materializationLag.observe(durationMs / 1000);
}

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export function startMetricsServer(port: number): Server {
  return startPrometheusMetricsServer({
    port,
    registry,
    logger,
    logMessage: 'Event metrics server listening',
  });
}
