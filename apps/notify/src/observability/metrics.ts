import { startPrometheusMetricsServer } from '@specify-poker/shared';
import type { Server } from 'http';
import client, { Counter, Histogram, Registry } from 'prom-client';
import logger from './logger';

const registry = new Registry();

client.collectDefaultMetrics({ register: registry });

const notificationRequests = new Counter({
  name: 'notify_notifications_requested_total',
  help: 'Total notification requests received.',
  labelNames: ['type'],
  registers: [registry],
});

const pushDeliveries = new Counter({
  name: 'notify_push_delivery_total',
  help: 'Push delivery attempts by result.',
  labelNames: ['status'],
  registers: [registry],
});

const grpcRequestDuration = new Histogram({
  name: 'notify_grpc_request_duration_seconds',
  help: 'gRPC request duration in seconds.',
  labelNames: ['method', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [registry],
});

export function recordNotificationRequested(type: string) {
  notificationRequests.inc({ type });
}

export function recordPushDelivery(status: 'success' | 'failure' | 'cleanup') {
  pushDeliveries.inc({ status });
}

export function recordGrpcRequest(method: string, status: 'ok' | 'error', durationMs: number) {
  grpcRequestDuration.observe({ method, status }, durationMs / 1000);
}

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export function startMetricsServer(port: number): Server {
  return startPrometheusMetricsServer({
    port,
    registry,
    logger,
    logMessage: 'Notify metrics server listening',
  });
}
