type MetricType = "counter" | "gauge";
type Labels = Record<string, string>;

type Series = {
  labels: Labels;
  value: number;
};

const counterSeries = new Map<string, Map<string, Series>>();
const gaugeSeries = new Map<string, Map<string, Series>>();
const metadata = new Map<string, { help: string; type: MetricType }>();
const metricOrder: string[] = [];
const handStartTimes = new Map<string, number>();
let initialized = false;

function registerMetric(name: string, help: string, type: MetricType) {
  if (!metadata.has(name)) {
    metadata.set(name, { help, type });
    metricOrder.push(name);
  }
}

function normalizeLabels(labels?: Labels) {
  if (!labels) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(labels).map(([key, value]) => [key, String(value)]),
  );
}

function labelKey(labels: Labels) {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function escapeLabelValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, "\\\"");
}

function formatLabels(labels: Labels) {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }
  const payload = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(",");
  return `{${payload}}`;
}

function getSeriesStore(type: MetricType) {
  return type === "counter" ? counterSeries : gaugeSeries;
}

function ensureSeries(name: string, type: MetricType, labels: Labels) {
  const store = getSeriesStore(type);
  const seriesByLabel = store.get(name) ?? new Map<string, Series>();
  const key = labelKey(labels);
  let series = seriesByLabel.get(key);
  if (!series) {
    series = { labels, value: 0 };
    seriesByLabel.set(key, series);
  }
  store.set(name, seriesByLabel);
  return series;
}

function incrementCounter(name: string, labels?: Labels, amount = 1) {
  const meta = metadata.get(name);
  if (!meta || meta.type !== "counter") {
    return;
  }
  const series = ensureSeries(name, "counter", normalizeLabels(labels));
  series.value += amount;
}

function setGauge(name: string, value: number, labels?: Labels) {
  const meta = metadata.get(name);
  if (!meta || meta.type !== "gauge") {
    return;
  }
  const series = ensureSeries(name, "gauge", normalizeLabels(labels));
  series.value = value;
}

function addGauge(name: string, delta: number, labels?: Labels) {
  const meta = metadata.get(name);
  if (!meta || meta.type !== "gauge") {
    return;
  }
  const series = ensureSeries(name, "gauge", normalizeLabels(labels));
  series.value = Math.max(0, series.value + delta);
}

export function initApiMetrics() {
  if (initialized) {
    return;
  }
  registerMetric("poker_actions_total", "Total number of poker actions processed.", "counter");
  registerMetric(
    "poker_actions_by_type_total",
    "Poker action results by type and acceptance.",
    "counter",
  );
  registerMetric(
    "poker_action_attempts_total",
    "Total poker action attempts received over WebSocket.",
    "counter",
  );
  registerMetric("poker_action_rejections_total", "Rejected poker actions by reason.", "counter");
  registerMetric("poker_active_connections", "Active websocket connections.", "gauge");
  registerMetric("poker_active_table_subscriptions", "Active table subscriptions.", "gauge");
  registerMetric("poker_active_chat_subscriptions", "Active chat subscriptions.", "gauge");
  registerMetric("poker_hands_started_total", "Hands started.", "counter");
  registerMetric("poker_hands_ended_total", "Hands ended.", "counter");
  registerMetric("poker_hands_showdown_total", "Hands reaching showdown.", "counter");
  registerMetric("poker_hand_duration_seconds_sum", "Total hand duration in seconds.", "counter");
  registerMetric("poker_hand_duration_seconds_count", "Hand duration samples.", "counter");
  registerMetric("poker_hand_duration_seconds_max", "Longest hand duration in seconds.", "gauge");
  registerMetric("poker_turn_timeouts_total", "Turn timeouts executed.", "counter");
  registerMetric("poker_ws_messages_total", "WebSocket messages received by type.", "counter");
  registerMetric("poker_ws_errors_total", "WebSocket errors by code.", "counter");
  registerMetric("poker_rate_limit_total", "Rate limit events by channel.", "counter");
  registerMetric("poker_table_joins_total", "Seat joins.", "counter");
  registerMetric("poker_table_leaves_total", "Seat leaves.", "counter");
  registerMetric("poker_table_reconnects_total", "Seat reconnects.", "counter");
  registerMetric("poker_chat_messages_total", "Chat messages sent.", "counter");
  registerMetric("poker_chat_errors_total", "Chat errors by reason.", "counter");

  // User journey and experience metrics
  registerMetric("poker_sessions_total", "Total user sessions started.", "counter");
  registerMetric("poker_session_duration_seconds_sum", "Total session duration in seconds.", "counter");
  registerMetric("poker_session_duration_seconds_count", "Session duration samples.", "counter");
  registerMetric("poker_session_hands_played_sum", "Total hands played per session.", "counter");
  registerMetric("poker_session_hands_played_count", "Session hands samples.", "counter");
  registerMetric("poker_view_transitions_total", "View transitions by from/to path.", "counter");

  // Friction point metrics
  registerMetric("poker_seat_join_failures_total", "Seat join failures by reason.", "counter");
  registerMetric("poker_table_create_failures_total", "Table creation failures by reason.", "counter");
  registerMetric("poker_auth_failures_total", "Authentication failures by reason.", "counter");
  registerMetric("poker_ws_reconnects_total", "WebSocket reconnection attempts.", "counter");
  registerMetric("poker_action_time_exceeded_total", "Actions submitted after timer warning.", "counter");

  // User quality and engagement metrics
  registerMetric("poker_vpip_actions_total", "Voluntary put money in pot actions.", "counter");
  registerMetric("poker_pfr_actions_total", "Pre-flop raise actions.", "counter");
  registerMetric("poker_decision_time_seconds_sum", "Total time spent making decisions.", "counter");
  registerMetric("poker_decision_time_seconds_count", "Decision time samples.", "counter");
  registerMetric("poker_allin_actions_total", "All-in actions.", "counter");
  registerMetric("poker_fold_to_raise_total", "Folds in response to a raise.", "counter");
  registerMetric("poker_hands_won_total", "Total hands won.", "counter");
  registerMetric("poker_showdown_wins_total", "Hands won at showdown.", "counter");
  registerMetric("poker_hands_per_table_sum", "Total hands played per table.", "counter");
  registerMetric("poker_hands_per_table_count", "Hands per table samples.", "counter");

  incrementCounter("poker_actions_total", {}, 0);
  setGauge("poker_active_connections", 0);
  setGauge("poker_active_table_subscriptions", 0);
  setGauge("poker_active_chat_subscriptions", 0);
  setGauge("poker_hand_duration_seconds_max", 0);
  initialized = true;
}

function ensureInitialized() {
  if (!initialized) {
    initApiMetrics();
  }
}

export function recordActionAttempt() {
  ensureInitialized();
  incrementCounter("poker_action_attempts_total");
}

export function recordActionResult(actionType: string, accepted: boolean, reason?: string) {
  ensureInitialized();
  if (accepted) {
    incrementCounter("poker_actions_total");
  }
  incrementCounter("poker_actions_by_type_total", {
    type: actionType,
    accepted: accepted ? "true" : "false",
  });
  if (!accepted) {
    incrementCounter("poker_action_rejections_total", {
      reason: reason ?? "unknown",
    });
  }
}

export function recordActionRejected(reason: string) {
  ensureInitialized();
  incrementCounter("poker_action_rejections_total", { reason });
}

export function recordHandStarted(handId: string) {
  ensureInitialized();
  incrementCounter("poker_hands_started_total");
  handStartTimes.set(handId, Date.now());
}

export function recordHandEnded(handId: string) {
  ensureInitialized();
  incrementCounter("poker_hands_ended_total");
  const start = handStartTimes.get(handId);
  if (start) {
    const durationSeconds = Math.max(0, (Date.now() - start) / 1000);
    incrementCounter("poker_hand_duration_seconds_sum", {}, durationSeconds);
    incrementCounter("poker_hand_duration_seconds_count");
    const maxSeries = ensureSeries("poker_hand_duration_seconds_max", "gauge", {});
    if (durationSeconds > maxSeries.value) {
      maxSeries.value = durationSeconds;
    }
    handStartTimes.delete(handId);
  }
}

export function recordHandShowdown() {
  ensureInitialized();
  incrementCounter("poker_hands_showdown_total");
}

export function recordTurnTimeout() {
  ensureInitialized();
  incrementCounter("poker_turn_timeouts_total");
}

export function recordWsMessage(type: string) {
  ensureInitialized();
  incrementCounter("poker_ws_messages_total", { type });
}

export function recordWsError(code: string) {
  ensureInitialized();
  incrementCounter("poker_ws_errors_total", { code });
}

export function recordRateLimit(channel: string) {
  ensureInitialized();
  incrementCounter("poker_rate_limit_total", { channel });
}

export function recordTableJoin() {
  ensureInitialized();
  incrementCounter("poker_table_joins_total");
}

export function recordTableLeave() {
  ensureInitialized();
  incrementCounter("poker_table_leaves_total");
}

export function recordTableReconnect() {
  ensureInitialized();
  incrementCounter("poker_table_reconnects_total");
}

export function recordChatMessage() {
  ensureInitialized();
  incrementCounter("poker_chat_messages_total");
}

export function recordChatError(reason: string) {
  ensureInitialized();
  incrementCounter("poker_chat_errors_total", { reason });
}

// User journey metrics
export function recordSessionStart() {
  ensureInitialized();
  incrementCounter("poker_sessions_total");
}

export function recordSessionEnd(durationSeconds: number, handsPlayed: number) {
  ensureInitialized();
  incrementCounter("poker_session_duration_seconds_sum", {}, durationSeconds);
  incrementCounter("poker_session_duration_seconds_count");
  incrementCounter("poker_session_hands_played_sum", {}, handsPlayed);
  incrementCounter("poker_session_hands_played_count");
}

export function recordViewTransition(from: string, to: string) {
  ensureInitialized();
  incrementCounter("poker_view_transitions_total", { from, to });
}

// Friction point metrics
export function recordSeatJoinFailure(reason: string) {
  ensureInitialized();
  incrementCounter("poker_seat_join_failures_total", { reason });
}

export function recordTableCreateFailure(reason: string) {
  ensureInitialized();
  incrementCounter("poker_table_create_failures_total", { reason });
}

export function recordAuthFailure(reason: string) {
  ensureInitialized();
  incrementCounter("poker_auth_failures_total", { reason });
}

export function recordWsReconnect() {
  ensureInitialized();
  incrementCounter("poker_ws_reconnects_total");
}

export function recordActionTimeExceeded() {
  ensureInitialized();
  incrementCounter("poker_action_time_exceeded_total");
}

// User quality and engagement metrics
export function recordVpipAction() {
  ensureInitialized();
  incrementCounter("poker_vpip_actions_total");
}

export function recordPfrAction() {
  ensureInitialized();
  incrementCounter("poker_pfr_actions_total");
}

export function recordDecisionTime(durationSeconds: number) {
  ensureInitialized();
  incrementCounter("poker_decision_time_seconds_sum", {}, durationSeconds);
  incrementCounter("poker_decision_time_seconds_count");
}

export function recordAllinAction() {
  ensureInitialized();
  incrementCounter("poker_allin_actions_total");
}

export function recordFoldToRaise() {
  ensureInitialized();
  incrementCounter("poker_fold_to_raise_total");
}

export function recordHandWon() {
  ensureInitialized();
  incrementCounter("poker_hands_won_total");
}

export function recordShowdownWin() {
  ensureInitialized();
  incrementCounter("poker_showdown_wins_total");
}

export function recordHandsPerTable(count: number) {
  ensureInitialized();
  incrementCounter("poker_hands_per_table_sum", {}, count);
  incrementCounter("poker_hands_per_table_count");
}

export function updateActiveConnections(delta: number) {
  ensureInitialized();
  if (!Number.isFinite(delta) || delta === 0) {
    return;
  }
  addGauge("poker_active_connections", delta);
}

export function updateActiveTableSubscriptions(delta: number) {
  ensureInitialized();
  if (!Number.isFinite(delta) || delta === 0) {
    return;
  }
  addGauge("poker_active_table_subscriptions", delta);
}

export function updateActiveChatSubscriptions(delta: number) {
  ensureInitialized();
  if (!Number.isFinite(delta) || delta === 0) {
    return;
  }
  addGauge("poker_active_chat_subscriptions", delta);
}

export function renderPrometheusMetrics() {
  ensureInitialized();
  const lines: string[] = [];
  for (const name of metricOrder) {
    const meta = metadata.get(name);
    if (!meta) {
      continue;
    }
    lines.push(`# HELP ${name} ${meta.help}`);
    lines.push(`# TYPE ${name} ${meta.type}`);

    const store = getSeriesStore(meta.type);
    const seriesByLabel = store.get(name);
    if (seriesByLabel) {
      for (const series of seriesByLabel.values()) {
        lines.push(`${name}${formatLabels(series.labels)} ${series.value}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}
