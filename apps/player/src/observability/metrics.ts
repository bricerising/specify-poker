import { startPrometheusMetricsServer } from '@specify-poker/shared';
import type { Server } from 'http';
import client, { Counter, Histogram, Registry } from 'prom-client';
import logger from './logger';

const registry = new Registry();

client.collectDefaultMetrics({ register: registry });

const profileLookups = new Counter({
  name: 'player_profile_lookups_total',
  help: 'Total profile lookups.',
  labelNames: ['status'],
  registers: [registry],
});

const profileUpdates = new Counter({
  name: 'player_profile_updates_total',
  help: 'Total profile updates.',
  labelNames: ['status'],
  registers: [registry],
});

const friendMutations = new Counter({
  name: 'player_friend_mutations_total',
  help: 'Total friend add/remove operations.',
  labelNames: ['action', 'status'],
  registers: [registry],
});

const statsUpdates = new Counter({
  name: 'player_statistics_updates_total',
  help: 'Total statistics updates.',
  labelNames: ['type'],
  registers: [registry],
});

const grpcRequestDuration = new Histogram({
  name: 'player_grpc_request_duration_seconds',
  help: 'gRPC request duration in seconds.',
  labelNames: ['method', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [registry],
});

export function recordProfileLookup(status: 'ok' | 'deleted' | 'created') {
  profileLookups.inc({ status });
}

export function recordProfileUpdate(status: 'ok' | 'error') {
  profileUpdates.inc({ status });
}

export function recordFriendMutation(action: 'add' | 'remove', status: 'ok' | 'error') {
  friendMutations.inc({ action, status });
}

export function recordStatisticsUpdate(type: string) {
  statsUpdates.inc({ type });
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
    logMessage: 'Player metrics server listening',
  });
}
