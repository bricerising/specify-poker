#!/usr/bin/env node

import process from "node:process";
import { createClient } from "redis";

const DEFAULT_LOCAL_REDIS_URL = "redis://localhost:6379";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_SCAN_COUNT = 200;
const DEFAULT_SCAN_LIMIT = 5_000;

function printUsage(registry) {
  const commandLines = registry
    .list()
    .map((command) => `  ${command.path.join(" ")}${command.usageSuffix ? ` ${command.usageSuffix}` : ""}`)
    .join("\n");

  // eslint-disable-next-line no-console
  console.log(
    `
Usage:
  npm run redis -- <command> [options]
  node scripts/redis.mjs <command> [options]

Global options:
  --url=<redisUrl>                 Redis URL (default: ${DEFAULT_LOCAL_REDIS_URL})
  --user=<username>                Redis ACL username (optional)
  --password=<password>            Redis password (optional)
  --db=<n>                         Redis database index (optional)
  --timeout-ms=<ms>                Connect timeout (default: ${DEFAULT_TIMEOUT_MS})
  --local                          Shorthand for local dev (${DEFAULT_LOCAL_REDIS_URL})
  --json                           Output machine-readable JSON
  -h, --help                       Show help

Commands:
${commandLines}

Notes:
  - Prefer \`keys scan\` over \`KEYS\` for production-like safety.
  - For pub/sub troubleshooting (e.g. gateway WS fanout), use \`pubsub subscribe\`.
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

class OutputStrategy {
  printText(_text) {}
  printJson(_value) {}
}

class TextOutputStrategy extends OutputStrategy {
  printText(text) {
    // eslint-disable-next-line no-console
    console.log(text);
  }

  printJson(value) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(value, null, 2));
  }
}

class JsonOutputStrategy extends OutputStrategy {
  printText(text) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ text }));
  }

  printJson(value) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(value));
  }
}

class RedisSession {
  constructor(config) {
    this.config = config;
    this.client = null;
  }

  async connect() {
    if (this.client) {
      return this.client;
    }

    const url = this.config.url;
    const username = this.config.username ?? undefined;
    const password = this.config.password ?? undefined;
    const database = this.config.database ?? undefined;

    const client = createClient({
      url,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(database !== undefined ? { database } : {}),
      socket: { connectTimeout: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    });

    client.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("redis.error", err instanceof Error ? err.message : err);
    });

    await client.connect();
    this.client = client;
    return client;
  }

  async close() {
    if (!this.client) {
      return;
    }
    try {
      await this.client.quit();
    } finally {
      this.client = null;
    }
  }
}

class RedisCommand {
  constructor(params) {
    this.path = params.path;
    this.description = params.description;
    this.usageSuffix = params.usageSuffix ?? "";
    this.flagSpec = params.flagSpec ?? {};
  }

  async execute(_ctx) {
    throw new Error("Not implemented");
  }
}

class CommandRegistry {
  constructor(commands) {
    this.commands = commands;
  }

  list() {
    return [...this.commands].sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")));
  }

  find(tokens) {
    const candidates = this.commands.filter((command) => {
      if (tokens.length < command.path.length) return false;
      for (let i = 0; i < command.path.length; i += 1) {
        if (tokens[i] !== command.path[i]) return false;
      }
      return true;
    });
    if (candidates.length === 0) {
      return null;
    }
    candidates.sort((a, b) => b.path.length - a.path.length);
    const match = candidates[0];
    return { command: match, rest: tokens.slice(match.path.length) };
  }
}

function parseInfo(text) {
  const lines = String(text).split(/\r?\n/);
  const out = {};
  let section = null;
  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      section = line.startsWith("#") ? line.slice(1).trim() : section;
      continue;
    }
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const dest = section ? `${section}.${key}` : key;
    out[dest] = value;
  }
  return out;
}

class HealthCommand extends RedisCommand {
  constructor() {
    super({ path: ["health"], description: "Ping Redis and report connectivity." });
  }

  async execute(ctx) {
    const startedAt = Date.now();
    const client = await ctx.session.connect();
    const ping = await client.ping();
    const latencyMs = Date.now() - startedAt;
    ctx.output.printJson({ ok: ping === "PONG", ping, latencyMs });
  }
}

class InfoCommand extends RedisCommand {
  constructor() {
    super({
      path: ["info"],
      description: "Show Redis INFO.",
      usageSuffix: "[--section=<name>]",
      flagSpec: { section: { type: "string" } },
    });
  }

  async execute(ctx) {
    const section = resolveStringOption(ctx.commandFlags, "section", null, null);
    const client = await ctx.session.connect();
    const raw = section ? await client.info(section) : await client.info();
    const parsed = parseInfo(raw);
    ctx.output.printJson({ section: section ?? "all", info: parsed });
  }
}

class KeysScanCommand extends RedisCommand {
  constructor() {
    super({
      path: ["keys", "scan"],
      description: "List keys via SCAN (safe for production-like usage).",
      usageSuffix: "[--match=<glob>] [--count=<n>] [--limit=<n>]",
      flagSpec: {
        match: { type: "string" },
        count: { type: "string" },
        limit: { type: "string" },
      },
    });
  }

  async execute(ctx) {
    const match = resolveStringOption(ctx.commandFlags, "match", null, null);
    const countRaw = resolveStringOption(ctx.commandFlags, "count", null, null);
    const limitRaw = resolveStringOption(ctx.commandFlags, "limit", null, null);
    const count = countRaw ? parseIntStrict(countRaw, "--count") : DEFAULT_SCAN_COUNT;
    const limit = limitRaw ? parseIntStrict(limitRaw, "--limit") : DEFAULT_SCAN_LIMIT;

    const client = await ctx.session.connect();

    let cursor = 0;
    const seen = new Set();
    const keys = [];
    do {
      const reply = await client.scan(cursor, {
        ...(match ? { MATCH: match } : {}),
        COUNT: count,
      });
      cursor = typeof reply.cursor === "number" ? reply.cursor : parseIntStrict(String(reply.cursor), "scan.cursor");
      for (const key of reply.keys) {
        if (seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
        if (keys.length >= limit) {
          break;
        }
      }
      if (keys.length >= limit) {
        break;
      }
    } while (cursor !== 0);

    ctx.output.printJson({
      match: match ?? null,
      count,
      limit,
      returned: keys.length,
      complete: cursor === 0 || keys.length >= limit,
      keys: keys.slice(0, limit),
    });
  }
}

class GetCommand extends RedisCommand {
  constructor() {
    super({
      path: ["get"],
      description: "Get a string value (GET).",
      usageSuffix: "<key> [--parse-json]",
      flagSpec: {
        "parse-json": { type: "boolean", dest: "parseJson" },
      },
    });
  }

  async execute(ctx) {
    const key = ctx.commandArgs[0];
    if (!key) {
      throw new Error("Missing <key>");
    }
    const parseJson = resolveBoolOption(ctx.commandFlags, "parseJson", null);
    const client = await ctx.session.connect();
    const value = await client.get(key);
    if (!parseJson || value === null) {
      ctx.output.printJson({ key, value });
      return;
    }
    try {
      ctx.output.printJson({ key, value: JSON.parse(value) });
    } catch {
      ctx.output.printJson({ key, value, warning: "value_not_json" });
    }
  }
}

class TypeCommand extends RedisCommand {
  constructor() {
    super({ path: ["type"], description: "Get the Redis type for a key.", usageSuffix: "<key>" });
  }

  async execute(ctx) {
    const key = ctx.commandArgs[0];
    if (!key) {
      throw new Error("Missing <key>");
    }
    const client = await ctx.session.connect();
    const type = await client.type(key);
    ctx.output.printJson({ key, type });
  }
}

class TtlCommand extends RedisCommand {
  constructor() {
    super({ path: ["ttl"], description: "Get TTL for a key.", usageSuffix: "<key>" });
  }

  async execute(ctx) {
    const key = ctx.commandArgs[0];
    if (!key) {
      throw new Error("Missing <key>");
    }
    const client = await ctx.session.connect();
    const ttlSeconds = await client.ttl(key);
    ctx.output.printJson({ key, ttlSeconds });
  }
}

class PubSubChannelsCommand extends RedisCommand {
  constructor() {
    super({
      path: ["pubsub", "channels"],
      description: "List active pub/sub channels.",
      usageSuffix: "[--pattern=<glob>]",
      flagSpec: { pattern: { type: "string" } },
    });
  }

  async execute(ctx) {
    const pattern = resolveStringOption(ctx.commandFlags, "pattern", null, null);
    const client = await ctx.session.connect();
    const channels = pattern ? await client.pubSubChannels(pattern) : await client.pubSubChannels();
    ctx.output.printJson({ pattern: pattern ?? null, count: channels.length, channels });
  }
}

class PubSubNumSubCommand extends RedisCommand {
  constructor() {
    super({
      path: ["pubsub", "numsub"],
      description: "Show subscriber counts for channels.",
      usageSuffix: "<channel...>",
    });
  }

  async execute(ctx) {
    const channels = ctx.commandArgs;
    if (!channels.length) {
      throw new Error("Missing <channel...>");
    }
    const client = await ctx.session.connect();
    const reply = await client.pubSubNumSub(channels);
    ctx.output.printJson({ channels: reply });
  }
}

class PubSubSubscribeCommand extends RedisCommand {
  constructor() {
    super({
      path: ["pubsub", "subscribe"],
      description: "Subscribe to a channel and print messages.",
      usageSuffix:
        "<channel> [--duration=<dur>] [--max=<n>] [--contains=<text>] [--regex=<re>] [--parse-json] [--table-id=<id>]",
      flagSpec: {
        since: { type: "string", dest: "duration" },
        duration: { type: "string" },
        max: { type: "string" },
        contains: { type: "string" },
        regex: { type: "string" },
        "parse-json": { type: "boolean", dest: "parseJson" },
        "table-id": { type: "string", dest: "tableId" },
      },
    });
  }

  async execute(ctx) {
    const channel = ctx.commandArgs[0];
    if (!channel) {
      throw new Error("Missing <channel>");
    }

    const duration = resolveStringOption(ctx.commandFlags, "duration", null, null);
    const maxRaw = resolveStringOption(ctx.commandFlags, "max", null, null);
    const contains = resolveStringOption(ctx.commandFlags, "contains", null, null);
    const regexRaw = resolveStringOption(ctx.commandFlags, "regex", null, null);
    const parseJson = resolveBoolOption(ctx.commandFlags, "parseJson", null);
    const tableId = resolveStringOption(ctx.commandFlags, "tableId", null, null);
    const max = maxRaw ? parseIntStrict(maxRaw, "--max") : null;
    const matcher = regexRaw ? new RegExp(regexRaw) : null;

    const startedAt = Date.now();
    const stopAfterMs = duration ? parseDurationMs(duration) : null;

    const client = await ctx.session.connect();
    const sub = client.duplicate();
    await sub.connect();

    let seen = 0;
    const stop = async (reason) => {
      try {
        await sub.unsubscribe(channel);
      } catch {
        // ignore
      }
      await sub.quit();
      ctx.output.printJson({
        ok: true,
        channel,
        messages: seen,
        stopped: reason,
        durationMs: Date.now() - startedAt,
      });
    };

    let stopTimer = null;
    if (stopAfterMs !== null) {
      stopTimer = setTimeout(() => {
        void stop("timeout");
      }, stopAfterMs);
    }

    await sub.subscribe(channel, async (message) => {
      if (stopTimer && Date.now() - startedAt > stopAfterMs) {
        return;
      }

      if (contains && !message.includes(contains)) {
        return;
      }
      if (matcher && !matcher.test(message)) {
        return;
      }

      let payload = message;
      if (parseJson) {
        try {
          payload = JSON.parse(message);
        } catch {
          payload = { raw: message, warning: "message_not_json" };
        }
      }

      if (tableId && isRecord(payload)) {
        const value = payload.tableId ?? payload.table_id;
        if (String(value ?? "") !== tableId) {
          return;
        }
      } else if (tableId) {
        return;
      }

      seen += 1;
      ctx.output.printJson({ channel, message: payload });

      if (max !== null && seen >= max) {
        if (stopTimer) clearTimeout(stopTimer);
        await stop("max_messages");
      }
    });
  }
}

const registry = new CommandRegistry([
  new HealthCommand(),
  new InfoCommand(),
  new KeysScanCommand(),
  new GetCommand(),
  new TypeCommand(),
  new TtlCommand(),
  new PubSubChannelsCommand(),
  new PubSubNumSubCommand(),
  new PubSubSubscribeCommand(),
]);

const globalFlagSpec = {
  url: { type: "string" },
  user: { type: "string" },
  password: { type: "string" },
  db: { type: "string" },
  "timeout-ms": { type: "string", dest: "timeoutMs" },
  local: { type: "boolean" },
  json: { type: "boolean" },
};

async function main() {
  const argv = process.argv.slice(2);

  const { globalArgv, commandArgv } = splitGlobalFlags(argv, globalFlagSpec);
  const { flags } = parseFlags(globalArgv, globalFlagSpec);
  const tokens = [...commandArgv];

  if (flags.help || tokens.length === 0) {
    printUsage(registry);
    return;
  }

  const match = registry.find(tokens);
  if (!match) {
    // eslint-disable-next-line no-console
    console.error(`Unknown command: ${tokens.join(" ")}`);
    printUsage(registry);
    process.exitCode = 1;
    return;
  }

  const command = match.command;
  let commandParsed;
  try {
    commandParsed = parseFlags(match.rest, command.flagSpec ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(message);
    // eslint-disable-next-line no-console
    console.error(`\nCommand: ${command.path.join(" ")}`);
    printUsage(registry);
    process.exitCode = 1;
    return;
  }

  if (commandParsed.flags.help) {
    // eslint-disable-next-line no-console
    console.log(`${command.path.join(" ")} - ${command.description}`);
    printUsage(registry);
    return;
  }

  const local = resolveBoolOption(flags, "local", null);
  const url = local
    ? DEFAULT_LOCAL_REDIS_URL
    : resolveStringOption(flags, "url", "REDIS_URL", DEFAULT_LOCAL_REDIS_URL);
  const username = resolveStringOption(flags, "user", "REDIS_USERNAME", null);
  const password = resolveStringOption(flags, "password", "REDIS_PASSWORD", null);
  const dbRaw = resolveStringOption(flags, "db", "REDIS_DB", null);
  const timeoutRaw = resolveStringOption(flags, "timeoutMs", "REDIS_TIMEOUT_MS", null);
  const timeoutMs = timeoutRaw ? parseIntStrict(timeoutRaw, "--timeout-ms") : DEFAULT_TIMEOUT_MS;
  const database = dbRaw ? parseIntStrict(dbRaw, "--db") : undefined;

  const output = resolveBoolOption(flags, "json", null) ? new JsonOutputStrategy() : new TextOutputStrategy();
  const session = new RedisSession({ url, username, password, database, timeoutMs });

  try {
    await command.execute({
      output,
      session,
      commandFlags: commandParsed.flags,
      commandArgs: commandParsed.rest,
    });
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
