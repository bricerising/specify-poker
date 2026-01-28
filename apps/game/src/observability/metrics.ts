import { startPrometheusMetricsServer } from "@specify-poker/shared";
import type { Server } from "http";
import client, { Counter, Gauge, Histogram, Registry } from "prom-client";
import logger from "./logger";

const registry = new Registry();

client.collectDefaultMetrics({ register: registry });

const grpcDuration = new Histogram({
  name: "game_grpc_request_duration_seconds",
  help: "gRPC request duration in seconds.",
  labelNames: ["method", "status"],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [registry],
});

const handsStarted = new Counter({
  name: "game_hands_started_total",
  help: "Total number of hands started.",
  labelNames: ["table_id"],
  registers: [registry],
});

const handsCompleted = new Counter({
  name: "game_hands_completed_total",
  help: "Total number of hands completed.",
  labelNames: ["table_id", "outcome"],
  registers: [registry],
});

const actionsProcessed = new Counter({
  name: "game_actions_processed_total",
  help: "Total number of player actions processed.",
  labelNames: ["action_type"],
  registers: [registry],
});

const seatJoins = new Counter({
  name: "game_seat_joins_total",
  help: "Total seat join attempts.",
  labelNames: ["status", "reason"],
  registers: [registry],
});

const turnTimeouts = new Counter({
  name: "game_turn_timeouts_total",
  help: "Total number of turn timeouts that trigger an auto action.",
  labelNames: ["street", "action_type"],
  registers: [registry],
});

const turnTimeDuration = new Histogram({
  name: "game_turn_duration_seconds",
  help: "Time taken for player to act on their turn.",
  labelNames: ["street", "action_type"],
  buckets: [1, 2, 5, 10, 15, 20, 30],
  registers: [registry],
});

const activeTables = new Gauge({
  name: "game_active_tables",
  help: "Number of active tables.",
  registers: [registry],
});

const seatedPlayers = new Gauge({
  name: "game_seated_players",
  help: "Total number of seated players across all tables.",
  registers: [registry],
});

const spectatorCount = new Gauge({
  name: "game_spectators_total",
  help: "Total number of spectators across all tables.",
  registers: [registry],
});

export function recordGrpcRequest(method: string, status: "ok" | "error", durationMs: number) {
  grpcDuration.observe({ method, status }, durationMs / 1000);
}

export function recordHandStarted(tableId: string) {
  handsStarted.inc({ table_id: tableId });
}

export function recordHandCompleted(tableId: string, outcome: "showdown" | "fold_win" | "timeout") {
  handsCompleted.inc({ table_id: tableId, outcome });
}

export function recordAction(actionType: string) {
  actionsProcessed.inc({ action_type: actionType });
}

export function recordSeatJoin(status: "ok" | "error", reason: string) {
  seatJoins.inc({ status, reason });
}

export function recordTurnTimeout(street: string, actionType: string) {
  turnTimeouts.inc({ street, action_type: actionType });
}

export function recordTurnTime(street: string, actionType: string, durationMs: number) {
  turnTimeDuration.observe({ street, action_type: actionType }, durationMs / 1000);
}

export function setActiveTables(count: number) {
  activeTables.set(count);
}

export function setSeatedPlayers(count: number) {
  seatedPlayers.set(count);
}

export function setSpectatorCount(count: number) {
  spectatorCount.set(count);
}

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export function startMetricsServer(port: number): Server {
  return startPrometheusMetricsServer({
    port,
    registry,
    logger,
    logMessage: "Game metrics server listening",
  });
}
