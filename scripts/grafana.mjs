#!/usr/bin/env node

import { Buffer } from "node:buffer";
import process from "node:process";

const DEFAULT_LOCAL_GRAFANA_URL = "http://localhost:3001";
const DEFAULT_LOCAL_GRAFANA_USER = "admin";
const DEFAULT_LOCAL_GRAFANA_PASSWORD = "admin";
const DEFAULT_LOKI_DS_UID = "LOKI";
const DEFAULT_TEMPO_DS_UID = "TEMPO";
const DEFAULT_PROMETHEUS_DS_UID = "PROMETHEUS";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LOG_LIMIT = 200;

function printUsage() {
  // eslint-disable-next-line no-console
  console.log(
    `
Usage:
  npm run grafana -- <command> [options]
  node scripts/grafana.mjs <command> [options]

Global options:
  --url=<grafanaUrl>               Grafana base URL (default: ${DEFAULT_LOCAL_GRAFANA_URL})
  --token=<grafanaApiToken>        Grafana API token (recommended for Grafana Cloud)
  --user=<username>                Basic auth username
  --password=<password>            Basic auth password
  --org-id=<id>                    Set X-Grafana-Org-Id header
  --timeout-ms=<ms>                Request timeout (default: ${DEFAULT_TIMEOUT_MS})
  --local                          Shorthand for local dev auth (admin/admin)
  --json                           Output machine-readable JSON
  -h, --help                       Show help

Commands:
  health
  ds list
  logs labels [--uid=<uid>] [--since=<dur>] [--start=<time>] [--end=<time>]
  logs label-values <label> [--uid=<uid>] [--since=<dur>] [--start=<time>] [--end=<time>]
  logs services [--uid=<uid>] [--since=<dur>] [--start=<time>] [--end=<time>]
  logs query <logql> [--uid=<uid>] [--since=<dur>] [--start=<time>] [--end=<time>] [--limit=<n>] [--direction=backward|forward]
  logs service <service> [--since=<dur>] [--contains=<text>] [--regex=<re>] [--uid=<uid>]
  logs trace <traceId> [--since=<dur>] [--service=<service>|--service-regex=<re>] [--uid=<uid>]
  metrics query <promql> [--uid=<uid>] [--since=<dur>] [--start=<time>] [--end=<time>] [--step=<dur>] [--instant]
  traces get <traceId> [--uid=<uid>]
  traces search [--uid=<uid>] --query=<traceqlOrTags> [--start=<time>] [--end=<time>] [--limit=<n>]
  correlate trace <traceId> [--since=<dur>] [--service=<service>|--service-regex=<re>]

Time formats:
  --since: 30s | 5m | 2h | 1d
  --start/--end: ISO-8601 (e.g. 2026-01-26T16:00:00Z) or unix seconds/ms
`.trim(),
  );
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseIntStrict(value, flagName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing value for ${flagName}`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${flagName}: ${value}`);
  }
  return parsed;
}

function parseDurationMs(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("Duration must be a non-empty string (e.g. 5m, 2h)");
  }
  const match = /^(\d+)\s*(ms|s|m|h|d)\s*$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration: ${input} (expected e.g. 30s, 5m, 2h, 1d)`);
  }
  const amount = Number.parseInt(match[1] ?? "0", 10);
  const unit = match[2] ?? "ms";
  const factor =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1_000
        : unit === "m"
          ? 60_000
          : unit === "h"
            ? 3_600_000
            : unit === "d"
              ? 86_400_000
              : 1;
  return amount * factor;
}

function parseTimeMs(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("Time must be a non-empty string");
  }
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    const raw = BigInt(trimmed);
    if (trimmed.length >= 16) {
      return Number(raw / 1_000_000n);
    }
    if (trimmed.length >= 13) {
      return Number(raw);
    }
    return Number(raw * 1_000n);
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid time: ${input}`);
  }
  return parsed;
}

function msToNsString(ms) {
  return (BigInt(ms) * 1_000_000n).toString();
}

function nsStringToIso(ns) {
  try {
    const ms = Number(BigInt(ns) / 1_000_000n);
    return new Date(ms).toISOString();
  } catch {
    const ms = Math.floor(Number(ns) / 1e6);
    return new Date(ms).toISOString();
  }
}

function msToSecondsString(ms) {
  return String(ms / 1_000);
}

function quoteLogQlString(value) {
  return JSON.stringify(value);
}

function parseFlags(argv, spec, options = {}) {
  const { stopAtFirstNonFlag = false } = options;
  const parsed = {};
  const rest = [];

  const assign = (key, value) => {
    const existing = parsed[key];
    if (existing === undefined) {
      parsed[key] = value;
      return;
    }
    if (Array.isArray(existing)) {
      existing.push(value);
      return;
    }
    parsed[key] = [existing, value];
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "-h" || arg === "--help") {
      assign("help", true);
      continue;
    }
    if (!arg.startsWith("--") || arg === "--") {
      if (stopAtFirstNonFlag) {
        rest.push(...argv.slice(i));
        break;
      }
      rest.push(arg);
      continue;
    }

    const raw = arg.slice(2);
    const [flagName, inlineValue] = raw.split("=", 2);
    const specEntry = spec[flagName];
    if (!specEntry) {
      throw new Error(`Unknown option: --${flagName}`);
    }
    const dest = specEntry.dest ?? flagName;
    if (specEntry.type === "boolean") {
      assign(dest, true);
      continue;
    }
    const value = inlineValue ?? argv[i + 1];
    if (inlineValue === undefined) {
      i += 1;
    }
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Missing value for --${flagName}`);
    }
    assign(dest, value);
  }

  return { flags: parsed, rest };
}

function envOrNull(key) {
  const value = process.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveStringOption(flags, key, envKey, fallback = null) {
  const raw = flags[key];
  const val = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[raw.length - 1] : null;
  if (val) return val;
  const envVal = envKey ? envOrNull(envKey) : null;
  if (envVal) return envVal;
  return fallback;
}

function resolveBoolOption(flags, key, envKey) {
  const raw = flags[key];
  if (raw === true) return true;
  if (envKey) {
    const envVal = envOrNull(envKey);
    if (!envVal) return false;
    return envVal === "1" || envVal.toLowerCase() === "true" || envVal.toLowerCase() === "yes";
  }
  return false;
}

class AuthStrategy {
  apply(headers) {
    return headers;
  }

  describe() {
    return "none";
  }
}

class BasicAuthStrategy extends AuthStrategy {
  constructor(user, password) {
    super();
    this.user = user;
    this.password = password;
  }

  apply(headers) {
    const token = Buffer.from(`${this.user}:${this.password}`, "utf8").toString("base64");
    return { ...headers, Authorization: `Basic ${token}` };
  }

  describe() {
    return `basic:${this.user}`;
  }
}

class BearerTokenStrategy extends AuthStrategy {
  constructor(token) {
    super();
    this.token = token;
  }

  apply(headers) {
    return { ...headers, Authorization: `Bearer ${this.token}` };
  }

  describe() {
    return "token";
  }
}

class GrafanaClient {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.orgId = config.orgId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.auth = config.auth;
    this.userAgent = config.userAgent ?? "specify-poker-grafana-cli";
  }

  buildUrl(pathname, queryParams = null) {
    const url = new URL(`${this.baseUrl}${pathname.startsWith("/") ? "" : "/"}${pathname}`);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  async request(pathname, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = {
        Accept: "application/json",
        "User-Agent": this.userAgent,
        ...(this.orgId ? { "X-Grafana-Org-Id": String(this.orgId) } : {}),
        ...(options.headers ?? {}),
      };
      const finalHeaders = this.auth.apply(headers);
      const url = this.buildUrl(pathname, options.query ?? null);
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: finalHeaders,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async requestJson(pathname, options = {}) {
    const res = await this.request(pathname, options);
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const detail = parsed ? JSON.stringify(parsed) : text;
      throw new Error(`Grafana request failed: ${res.status} ${res.statusText}${detail ? ` - ${detail}` : ""}`);
    }
    return parsed;
  }

  health() {
    return this.requestJson("/api/health");
  }

  listDatasources() {
    return this.requestJson("/api/datasources");
  }

  proxyJson(uid, upstreamPath, queryParams = null) {
    const encoded = encodeURIComponent(uid);
    return this.requestJson(`/api/datasources/proxy/uid/${encoded}${upstreamPath}`, { query: queryParams ?? undefined });
  }
}

class DatasourceRegistry {
  constructor(grafana) {
    this.grafana = grafana;
    this.cache = null;
  }

  async list() {
    if (this.cache) {
      return this.cache;
    }
    const list = await this.grafana.listDatasources();
    if (!Array.isArray(list)) {
      throw new Error("Unexpected Grafana datasources response");
    }
    this.cache = list;
    return list;
  }

  async findByUid(uid) {
    const all = await this.list();
    return all.find((entry) => isRecord(entry) && entry.uid === uid) ?? null;
  }

  async findByType(type) {
    const all = await this.list();
    return all.filter((entry) => isRecord(entry) && entry.type === type);
  }

  async resolveUid({ explicitUid, explicitName, type, defaultUid }) {
    if (explicitUid) {
      const found = await this.findByUid(explicitUid);
      if (!found) {
        throw new Error(`Datasource uid not found: ${explicitUid}`);
      }
      return explicitUid;
    }

    if (explicitName) {
      const all = await this.list();
      const found = all.find((entry) => isRecord(entry) && entry.name === explicitName);
      if (!found || !isRecord(found) || typeof found.uid !== "string") {
        throw new Error(`Datasource name not found: ${explicitName}`);
      }
      return found.uid;
    }

    const matches = await this.findByType(type);
    if (matches.length === 1 && isRecord(matches[0]) && typeof matches[0].uid === "string") {
      return matches[0].uid;
    }

    if (defaultUid) {
      const found = await this.findByUid(defaultUid);
      if (found) {
        return defaultUid;
      }
    }

    const available = matches
      .map((entry) => (isRecord(entry) ? `${entry.name ?? "unknown"} (${entry.uid ?? "no-uid"})` : "unknown"))
      .join(", ");
    throw new Error(
      `Unable to resolve datasource for type=${type}. Provide --uid or --datasource. Candidates: ${available || "none"}`,
    );
  }
}

class LokiClient {
  constructor(grafana, uid) {
    this.grafana = grafana;
    this.uid = uid;
  }

  labels(params) {
    return this.grafana.proxyJson(this.uid, "/loki/api/v1/labels", params);
  }

  labelValues(labelName, params) {
    return this.grafana.proxyJson(
      this.uid,
      `/loki/api/v1/label/${encodeURIComponent(labelName)}/values`,
      params,
    );
  }

  queryRange(params) {
    return this.grafana.proxyJson(this.uid, "/loki/api/v1/query_range", params);
  }
}

class PrometheusClient {
  constructor(grafana, uid) {
    this.grafana = grafana;
    this.uid = uid;
  }

  queryInstant(params) {
    return this.grafana.proxyJson(this.uid, "/api/v1/query", params);
  }

  queryRange(params) {
    return this.grafana.proxyJson(this.uid, "/api/v1/query_range", params);
  }
}

class TempoClient {
  constructor(grafana, uid) {
    this.grafana = grafana;
    this.uid = uid;
  }

  getTrace(traceId) {
    return this.grafana.proxyJson(this.uid, `/api/traces/${encodeURIComponent(traceId)}`);
  }

  search(params) {
    return this.grafana.proxyJson(this.uid, "/api/search", params);
  }
}

function summarizeTempoTrace(trace) {
  if (!isRecord(trace)) {
    return null;
  }

  const serviceNames = new Set();
  let spanCount = 0;
  let earliestNs = null;
  let latestNs = null;

  const observeSpan = (span) => {
    if (!isRecord(span)) return;
    const start = span.startTimeUnixNano ?? span.start_time_unix_nano;
    const end = span.endTimeUnixNano ?? span.end_time_unix_nano;
    if (typeof start === "string" && /^\d+$/.test(start)) {
      if (!earliestNs || BigInt(start) < BigInt(earliestNs)) {
        earliestNs = start;
      }
    }
    if (typeof end === "string" && /^\d+$/.test(end)) {
      if (!latestNs || BigInt(end) > BigInt(latestNs)) {
        latestNs = end;
      }
    }
    spanCount += 1;
  };

  const extractServiceFromAttributes = (attributes) => {
    if (!Array.isArray(attributes)) return;
    for (const attr of attributes) {
      if (!isRecord(attr)) continue;
      const key = attr.key;
      if (key !== "service.name") continue;
      const value =
        attr.value?.stringValue
        ?? attr.value?.string_value
        ?? attr.value?.value
        ?? attr.value?.string;
      if (typeof value === "string" && value.trim()) {
        serviceNames.add(value.trim());
      }
    }
  };

  const walkResourceSpans = (resourceSpans) => {
    if (!Array.isArray(resourceSpans)) return;
    for (const rs of resourceSpans) {
      if (!isRecord(rs)) continue;
      const resource = rs.resource;
      if (isRecord(resource)) {
        extractServiceFromAttributes(resource.attributes);
      }
      const scopeSpans = rs.scopeSpans ?? rs.scope_spans ?? rs.instrumentationLibrarySpans;
      if (!Array.isArray(scopeSpans)) continue;
      for (const ss of scopeSpans) {
        if (!isRecord(ss)) continue;
        const spans = ss.spans;
        if (!Array.isArray(spans)) continue;
        for (const span of spans) {
          observeSpan(span);
        }
      }
    }
  };

  if (Array.isArray(trace.resourceSpans)) {
    walkResourceSpans(trace.resourceSpans);
  }
  if (Array.isArray(trace.batches)) {
    for (const batch of trace.batches) {
      if (!isRecord(batch)) continue;
      if (isRecord(batch.resource)) {
        extractServiceFromAttributes(batch.resource.attributes);
      }
      const rs = batch.resourceSpans ?? batch.resource_spans;
      if (Array.isArray(rs)) {
        walkResourceSpans(rs);
      }
      const ss = batch.scopeSpans ?? batch.scope_spans;
      if (Array.isArray(ss)) {
        for (const entry of ss) {
          if (!isRecord(entry)) continue;
          const spans = entry.spans;
          if (!Array.isArray(spans)) continue;
          for (const span of spans) {
            observeSpan(span);
          }
        }
      }
    }
  }

  if (spanCount === 0) {
    return null;
  }

  const durationMs =
    earliestNs && latestNs ? Number((BigInt(latestNs) - BigInt(earliestNs)) / 1_000_000n) : null;

  return {
    spanCount,
    services: Array.from(serviceNames).sort(),
    start: earliestNs ? nsStringToIso(earliestNs) : null,
    durationMs,
  };
}

function createContext(globalFlags) {
  const wantsLocal = resolveBoolOption(globalFlags, "local");
  const baseUrl = resolveStringOption(globalFlags, "url", "GRAFANA_URL", DEFAULT_LOCAL_GRAFANA_URL);
  const token = resolveStringOption(globalFlags, "token", "GRAFANA_TOKEN");
  const user = resolveStringOption(globalFlags, "user", "GRAFANA_USER", wantsLocal ? DEFAULT_LOCAL_GRAFANA_USER : null);
  const password = resolveStringOption(
    globalFlags,
    "password",
    "GRAFANA_PASSWORD",
    wantsLocal ? DEFAULT_LOCAL_GRAFANA_PASSWORD : null,
  );
  const orgIdRaw = resolveStringOption(globalFlags, "orgId", "GRAFANA_ORG_ID");
  const timeoutMs = parseIntStrict(
    resolveStringOption(globalFlags, "timeoutMs", "GRAFANA_TIMEOUT_MS", String(DEFAULT_TIMEOUT_MS)),
    "--timeout-ms",
  );

  const auth = token ? new BearerTokenStrategy(token) : user && password ? new BasicAuthStrategy(user, password) : new AuthStrategy();
  const grafana = new GrafanaClient({ baseUrl, orgId: orgIdRaw, timeoutMs, auth });
  const datasources = new DatasourceRegistry(grafana);

  return {
    baseUrl,
    auth,
    grafana,
    datasources,
    outputJson: resolveBoolOption(globalFlags, "json"),
  };
}

function resolveCommand(rest) {
  if (rest.length === 0 || rest[0] === "help") {
    return { key: "help", args: [] };
  }
  const key2 = rest.slice(0, 2).join(" ");
  const key1 = rest[0] ?? "";
  if (COMMANDS.has(key2)) {
    return { key: key2, args: rest.slice(2) };
  }
  if (COMMANDS.has(key1)) {
    return { key: key1, args: rest.slice(1) };
  }
  return { key: key1, args: rest.slice(1) };
}

async function cmdHealth(ctx, argv) {
  const { flags } = parseFlags(argv, { json: { type: "boolean" } });
  const json = ctx.outputJson || resolveBoolOption(flags, "json");
  const health = await ctx.grafana.health();
  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(health, null, 2));
    return;
  }
  const commit = isRecord(health) && typeof health.commit === "string" ? health.commit : "";
  const version = isRecord(health) && typeof health.version === "string" ? health.version : "";
  const database = isRecord(health) && typeof health.database === "string" ? health.database : "";
  // eslint-disable-next-line no-console
  console.log([`grafana: ${ctx.baseUrl}`, version ? `version: ${version}` : null, commit ? `commit: ${commit}` : null, database ? `db: ${database}` : null].filter(Boolean).join("\n"));
}

async function cmdDsList(ctx, argv) {
  const { flags } = parseFlags(argv, { json: { type: "boolean" } });
  const json = ctx.outputJson || resolveBoolOption(flags, "json");
  const datasources = await ctx.datasources.list();
  if (json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(datasources, null, 2));
    return;
  }
  for (const entry of datasources) {
    if (!isRecord(entry)) continue;
    const name = typeof entry.name === "string" ? entry.name : "unknown";
    const uid = typeof entry.uid === "string" ? entry.uid : "no-uid";
    const type = typeof entry.type === "string" ? entry.type : "unknown";
    const url = typeof entry.url === "string" ? entry.url : "";
    // eslint-disable-next-line no-console
    console.log(`${name}\t${uid}\t${type}${url ? `\t${url}` : ""}`);
  }
}

function buildRangeWindow(flags) {
  const nowMs = Date.now();
  const since = resolveStringOption(flags, "since", null);
  const start = resolveStringOption(flags, "start", null);
  const end = resolveStringOption(flags, "end", null);

  const endMs = end ? parseTimeMs(end) : nowMs;
  const startMs = start ? parseTimeMs(start) : since ? endMs - parseDurationMs(since) : endMs - parseDurationMs("15m");

  if (startMs > endMs) {
    throw new Error("Invalid time range: start is after end");
  }
  return { startMs, endMs };
}

async function resolveLoki(ctx, flags) {
  const uid = resolveStringOption(flags, "uid", "GRAFANA_LOKI_UID");
  const datasource = resolveStringOption(flags, "datasource", "GRAFANA_LOKI_DATASOURCE");
  const resolvedUid = await ctx.datasources.resolveUid({
    explicitUid: uid,
    explicitName: datasource,
    type: "loki",
    defaultUid: DEFAULT_LOKI_DS_UID,
  });
  return new LokiClient(ctx.grafana, resolvedUid);
}

async function resolvePrometheus(ctx, flags) {
  const uid = resolveStringOption(flags, "uid", "GRAFANA_PROMETHEUS_UID");
  const datasource = resolveStringOption(flags, "datasource", "GRAFANA_PROMETHEUS_DATASOURCE");
  const resolvedUid = await ctx.datasources.resolveUid({
    explicitUid: uid,
    explicitName: datasource,
    type: "prometheus",
    defaultUid: DEFAULT_PROMETHEUS_DS_UID,
  });
  return new PrometheusClient(ctx.grafana, resolvedUid);
}

async function resolveTempo(ctx, flags) {
  const uid = resolveStringOption(flags, "uid", "GRAFANA_TEMPO_UID");
  const datasource = resolveStringOption(flags, "datasource", "GRAFANA_TEMPO_DATASOURCE");
  const resolvedUid = await ctx.datasources.resolveUid({
    explicitUid: uid,
    explicitName: datasource,
    type: "tempo",
    defaultUid: DEFAULT_TEMPO_DS_UID,
  });
  return new TempoClient(ctx.grafana, resolvedUid);
}

async function cmdLogsQuery(ctx, argv) {
  const { flags, rest } = parseFlags(argv, {
    uid: { type: "string" },
    datasource: { type: "string" },
    since: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    limit: { type: "string" },
    direction: { type: "string" },
    json: { type: "boolean" },
  });

  const query = rest.join(" ").trim();
  if (!query) {
    throw new Error("Missing logql query (usage: logs query <logql>)");
  }

  const { startMs, endMs } = buildRangeWindow(flags);
  const limit = parseIntStrict(resolveStringOption(flags, "limit", null, String(DEFAULT_LOG_LIMIT)), "--limit");
  const directionRaw = resolveStringOption(flags, "direction", null, "BACKWARD");
  const direction = directionRaw.toLowerCase() === "forward" ? "FORWARD" : "BACKWARD";
  const outputJson = ctx.outputJson || resolveBoolOption(flags, "json");

  const loki = await resolveLoki(ctx, flags);
  const response = await loki.queryRange({
    query,
    start: msToNsString(startMs),
    end: msToNsString(endMs),
    limit,
    direction,
  });

  if (outputJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  const result = isRecord(response) ? response.data?.result : null;
  if (!Array.isArray(result) || result.length === 0) {
    // eslint-disable-next-line no-console
    console.log("(no logs)");
    return;
  }

  for (const stream of result) {
    if (!isRecord(stream) || !Array.isArray(stream.values)) continue;
    for (const entry of stream.values) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const ts = typeof entry[0] === "string" ? entry[0] : String(entry[0]);
      const line = typeof entry[1] === "string" ? entry[1] : JSON.stringify(entry[1]);
      // eslint-disable-next-line no-console
      console.log(`${nsStringToIso(ts)} ${line}`);
    }
  }
}

async function cmdLogsService(ctx, argv) {
  const { flags, rest } = parseFlags(argv, {
    since: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    contains: { type: "string" },
    regex: { type: "string" },
    uid: { type: "string" },
    datasource: { type: "string" },
    json: { type: "boolean" },
  });

  const service = rest[0]?.trim() ?? "";
  if (!service) {
    throw new Error("Missing service name (usage: logs service <service>)");
  }

  const contains = resolveStringOption(flags, "contains", null);
  const regex = resolveStringOption(flags, "regex", null);
  let query = `{service=${quoteLogQlString(service)}}`;
  if (contains) {
    query += ` |= ${quoteLogQlString(contains)}`;
  }
  if (regex) {
    query += ` |~ ${quoteLogQlString(regex)}`;
  }

  await cmdLogsQuery(ctx, [
    "--since",
    resolveStringOption(flags, "since", null, "15m"),
    ...(resolveStringOption(flags, "start", null) ? ["--start", resolveStringOption(flags, "start", null)] : []),
    ...(resolveStringOption(flags, "end", null) ? ["--end", resolveStringOption(flags, "end", null)] : []),
    ...(resolveStringOption(flags, "uid", null) ? ["--uid", resolveStringOption(flags, "uid", null)] : []),
    ...(resolveStringOption(flags, "datasource", null) ? ["--datasource", resolveStringOption(flags, "datasource", null)] : []),
    ...(resolveBoolOption(flags, "json") ? ["--json"] : []),
    query,
  ]);
}

async function cmdLogsLabels(ctx, argv) {
  const { flags } = parseFlags(argv, {
    since: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    uid: { type: "string" },
    datasource: { type: "string" },
    json: { type: "boolean" },
  });

  const outputJson = ctx.outputJson || resolveBoolOption(flags, "json");
  const loki = await resolveLoki(ctx, flags);
  const { startMs, endMs } = buildRangeWindow(flags);
  const response = await loki.labels({ start: msToNsString(startMs), end: msToNsString(endMs) });

  if (outputJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  const labels = isRecord(response) ? response.data : null;
  if (!Array.isArray(labels) || labels.length === 0) {
    // eslint-disable-next-line no-console
    console.log("(no labels)");
    return;
  }
  for (const label of labels) {
    // eslint-disable-next-line no-console
    console.log(String(label));
  }
}

async function cmdLogsLabelValues(ctx, argv, options = {}) {
  const { flags, rest } = parseFlags(argv, {
    since: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    uid: { type: "string" },
    datasource: { type: "string" },
    json: { type: "boolean" },
  });

  const labelName = (options.labelName ?? rest[0])?.trim() ?? "";
  if (!labelName) {
    throw new Error("Missing label name (usage: logs label-values <label>)");
  }

  const outputJson = ctx.outputJson || resolveBoolOption(flags, "json");
  const loki = await resolveLoki(ctx, flags);
  const { startMs, endMs } = buildRangeWindow(flags);
  const response = await loki.labelValues(labelName, { start: msToNsString(startMs), end: msToNsString(endMs) });

  if (outputJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  const values = isRecord(response) ? response.data : null;
  if (!Array.isArray(values) || values.length === 0) {
    // eslint-disable-next-line no-console
    console.log("(no values)");
    return;
  }
  for (const value of values) {
    // eslint-disable-next-line no-console
    console.log(String(value));
  }
}

async function cmdLogsServices(ctx, argv) {
  await cmdLogsLabelValues(ctx, argv, { labelName: "service" });
}

async function cmdLogsTrace(ctx, argv) {
  const { flags, rest } = parseFlags(argv, {
    since: { type: "string" },
    service: { type: "string" },
    "service-regex": { type: "string", dest: "serviceRegex" },
    uid: { type: "string" },
    datasource: { type: "string" },
    json: { type: "boolean" },
  });

  const traceId = rest[0]?.trim() ?? "";
  if (!traceId) {
    throw new Error("Missing traceId (usage: logs trace <traceId>)");
  }

  const service = resolveStringOption(flags, "service", null);
  const serviceRegex = resolveStringOption(flags, "serviceRegex", null);
  const selector = service
    ? `{service=${quoteLogQlString(service)}}`
    : serviceRegex
      ? `{service=~${quoteLogQlString(serviceRegex)}}`
      : `{service=~${quoteLogQlString(".+")}}`;

  const query = `${selector} |= ${quoteLogQlString(traceId)}`;
  await cmdLogsQuery(ctx, [
    "--since",
    resolveStringOption(flags, "since", null, "30m"),
    ...(resolveStringOption(flags, "uid", null) ? ["--uid", resolveStringOption(flags, "uid", null)] : []),
    ...(resolveStringOption(flags, "datasource", null) ? ["--datasource", resolveStringOption(flags, "datasource", null)] : []),
    ...(resolveBoolOption(flags, "json") ? ["--json"] : []),
    query,
  ]);
}

async function cmdMetricsQuery(ctx, argv) {
  const { flags, rest } = parseFlags(argv, {
    uid: { type: "string" },
    datasource: { type: "string" },
    since: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    step: { type: "string" },
    instant: { type: "boolean" },
    json: { type: "boolean" },
  });

  const query = rest.join(" ").trim();
  if (!query) {
    throw new Error("Missing promql query (usage: metrics query <promql>)");
  }

  const outputJson = ctx.outputJson || resolveBoolOption(flags, "json");
  const wantsInstant = resolveBoolOption(flags, "instant");
  const hasRange = Boolean(resolveStringOption(flags, "since", null) || resolveStringOption(flags, "start", null));

  const prom = await resolvePrometheus(ctx, flags);

  if (wantsInstant || !hasRange) {
    const response = await prom.queryInstant({ query });
    if (outputJson) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(response, null, 2));
      return;
    }
    const result = isRecord(response) ? response.data?.result : null;
    if (!Array.isArray(result) || result.length === 0) {
      // eslint-disable-next-line no-console
      console.log("(no series)");
      return;
    }
    for (const series of result) {
      if (!isRecord(series)) continue;
      const metric = isRecord(series.metric) ? series.metric : {};
      const labelPairs = Object.entries(metric)
        .map(([k, v]) => `${k}=${quoteLogQlString(String(v))}`)
        .join(",");
      const value = Array.isArray(series.value) ? series.value[1] : null;
      // eslint-disable-next-line no-console
      console.log(`${labelPairs || "(no labels)"}\t${value ?? ""}`);
    }
    return;
  }

  const { startMs, endMs } = buildRangeWindow(flags);
  const step = resolveStringOption(flags, "step", null, "30s");
  const response = await prom.queryRange({
    query,
    start: msToSecondsString(startMs),
    end: msToSecondsString(endMs),
    step: String(parseDurationMs(step) / 1000),
  });

  if (outputJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  const result = isRecord(response) ? response.data?.result : null;
  if (!Array.isArray(result) || result.length === 0) {
    // eslint-disable-next-line no-console
    console.log("(no series)");
    return;
  }

  for (const series of result) {
    if (!isRecord(series)) continue;
    const metric = isRecord(series.metric) ? series.metric : {};
    const labelPairs = Object.entries(metric)
      .map(([k, v]) => `${k}=${quoteLogQlString(String(v))}`)
      .join(",");
    const values = Array.isArray(series.values) ? series.values : [];
    const last = values.length ? values[values.length - 1] : null;
    const value = Array.isArray(last) ? last[1] : null;
    // eslint-disable-next-line no-console
    console.log(`${labelPairs || "(no labels)"}\t${value ?? ""}`);
  }
}

async function cmdTracesGet(ctx, argv) {
  const { flags, rest } = parseFlags(argv, {
    uid: { type: "string" },
    datasource: { type: "string" },
    json: { type: "boolean" },
  });

  const traceId = rest[0]?.trim() ?? "";
  if (!traceId) {
    throw new Error("Missing traceId (usage: traces get <traceId>)");
  }

  const tempo = await resolveTempo(ctx, flags);
  const trace = await tempo.getTrace(traceId);
  const outputJson = ctx.outputJson || resolveBoolOption(flags, "json");

  if (outputJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(trace, null, 2));
    return;
  }

  const summary = summarizeTempoTrace(trace);
  if (!summary) {
    // eslint-disable-next-line no-console
    console.log("(trace fetched; unable to summarize format)");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    [
      `traceId: ${traceId}`,
      `spans: ${summary.spanCount}`,
      summary.start ? `start: ${summary.start}` : null,
      typeof summary.durationMs === "number" ? `durationMs: ${summary.durationMs}` : null,
      summary.services.length ? `services: ${summary.services.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function cmdTracesSearch(ctx, argv) {
  const { flags } = parseFlags(argv, {
    uid: { type: "string" },
    datasource: { type: "string" },
    query: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    limit: { type: "string" },
    json: { type: "boolean" },
  });

  const query = resolveStringOption(flags, "query", null);
  if (!query) {
    throw new Error("Missing --query for traces search");
  }

  const tempo = await resolveTempo(ctx, flags);
  const nowMs = Date.now();
  const startMs = resolveStringOption(flags, "start", null) ? parseTimeMs(resolveStringOption(flags, "start", null)) : nowMs - parseDurationMs("30m");
  const endMs = resolveStringOption(flags, "end", null) ? parseTimeMs(resolveStringOption(flags, "end", null)) : nowMs;
  const limit = parseIntStrict(resolveStringOption(flags, "limit", null, "20"), "--limit");

  const response = await tempo.search({
    q: query,
    start: msToSecondsString(startMs),
    end: msToSecondsString(endMs),
    limit,
  });

  const outputJson = ctx.outputJson || resolveBoolOption(flags, "json");
  if (outputJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(response, null, 2));
    return;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(response, null, 2));
}

async function cmdCorrelateTrace(ctx, argv) {
  const { flags, rest } = parseFlags(argv, {
    since: { type: "string" },
    service: { type: "string" },
    "service-regex": { type: "string", dest: "serviceRegex" },
    json: { type: "boolean" },
  });

  const traceId = rest[0]?.trim() ?? "";
  if (!traceId) {
    throw new Error("Missing traceId (usage: correlate trace <traceId>)");
  }

  const outputJson = ctx.outputJson || resolveBoolOption(flags, "json");
  const service = resolveStringOption(flags, "service", null);
  const serviceRegex = resolveStringOption(flags, "serviceRegex", null);

  const selector = service
    ? `{service=${quoteLogQlString(service)}}`
    : serviceRegex
      ? `{service=~${quoteLogQlString(serviceRegex)}}`
      : `{service=~${quoteLogQlString(".+")}}`;

  const query = `${selector} |= ${quoteLogQlString(traceId)}`;

  const loki = await resolveLoki(ctx, flags);
  const { startMs, endMs } = (() => {
    const nowMs = Date.now();
    const since = resolveStringOption(flags, "since", null, "30m");
    return { startMs: nowMs - parseDurationMs(since), endMs: nowMs };
  })();

  const logs = await loki.queryRange({
    query,
    start: msToNsString(startMs),
    end: msToNsString(endMs),
    limit: DEFAULT_LOG_LIMIT,
    direction: "BACKWARD",
  });

  const tempo = await resolveTempo(ctx, flags);
  const trace = await tempo.getTrace(traceId);
  const summary = summarizeTempoTrace(trace);

  if (outputJson) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ traceId, logs, traceSummary: summary, trace }, null, 2));
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`traceId: ${traceId}`);
  if (summary) {
    // eslint-disable-next-line no-console
    console.log(`spans: ${summary.spanCount}${typeof summary.durationMs === "number" ? `, durationMs: ${summary.durationMs}` : ""}`);
    if (summary.services.length) {
      // eslint-disable-next-line no-console
      console.log(`services: ${summary.services.join(", ")}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Logs:");
  const result = isRecord(logs) ? logs.data?.result : null;
  if (!Array.isArray(result) || result.length === 0) {
    // eslint-disable-next-line no-console
    console.log("(no logs)");
    return;
  }
  for (const stream of result) {
    if (!isRecord(stream) || !Array.isArray(stream.values)) continue;
    for (const entry of stream.values) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const ts = typeof entry[0] === "string" ? entry[0] : String(entry[0]);
      const line = typeof entry[1] === "string" ? entry[1] : JSON.stringify(entry[1]);
      // eslint-disable-next-line no-console
      console.log(`${nsStringToIso(ts)} ${line}`);
    }
  }
}

const COMMANDS = new Map([
  ["help", { run: async () => printUsage() }],
  ["health", { run: cmdHealth }],
  ["ds list", { run: cmdDsList }],
  ["datasources list", { run: cmdDsList }],
  ["logs labels", { run: cmdLogsLabels }],
  ["logs label-values", { run: cmdLogsLabelValues }],
  ["logs services", { run: cmdLogsServices }],
  ["logs query", { run: cmdLogsQuery }],
  ["logs service", { run: cmdLogsService }],
  ["logs trace", { run: cmdLogsTrace }],
  ["metrics query", { run: cmdMetricsQuery }],
  ["traces get", { run: cmdTracesGet }],
  ["traces search", { run: cmdTracesSearch }],
  ["correlate trace", { run: cmdCorrelateTrace }],
]);

function splitGlobalFlags(argv, globalSpec) {
  const globalArgv = [];
  const commandArgv = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      commandArgv.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "-h" || arg === "--help") {
      globalArgv.push(arg);
      continue;
    }
    if (!arg.startsWith("--") || arg === "--") {
      commandArgv.push(arg);
      continue;
    }

    const raw = arg.slice(2);
    const [flagName, inlineValue] = raw.split("=", 2);
    const specEntry = globalSpec[flagName];
    if (!specEntry) {
      commandArgv.push(arg);
      continue;
    }

    globalArgv.push(arg);
    if (specEntry.type !== "boolean" && inlineValue === undefined) {
      const value = argv[i + 1];
      if (value !== undefined) {
        globalArgv.push(value);
        i += 1;
      }
    }
  }

  return { globalArgv, commandArgv };
}

async function main() {
  const argv = process.argv.slice(2);
  const globalSpec = {
    url: { type: "string" },
    token: { type: "string" },
    user: { type: "string" },
    password: { type: "string" },
    "org-id": { type: "string", dest: "orgId" },
    "timeout-ms": { type: "string", dest: "timeoutMs" },
    local: { type: "boolean" },
    json: { type: "boolean" },
  };
  const { globalArgv, commandArgv } = splitGlobalFlags(argv, globalSpec);
  const { flags: globalFlags, rest } = parseFlags(globalArgv, globalSpec);

  if (resolveBoolOption(globalFlags, "help")) {
    printUsage();
    return;
  }

  const { key, args } = resolveCommand([...commandArgv, ...rest]);
  const entry = COMMANDS.get(key);
  if (!entry) {
    throw new Error(`Unknown command: ${key}\n\nRun with --help to see available commands.`);
  }

  const ctx = createContext(globalFlags);
  await entry.run(ctx, args);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(message);
  process.exitCode = 1;
});
