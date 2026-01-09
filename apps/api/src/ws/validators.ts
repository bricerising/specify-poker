const allowedActions = new Set(["Fold", "Check", "Call", "Bet", "Raise"]);
const maxChatLength = 500;
const seatMin = 0;
const seatMax = 8;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const wsWindowMs = Number(process.env.WS_RATE_LIMIT_WINDOW_MS ?? 10000);
const wsMax = Number(process.env.WS_RATE_LIMIT_MAX ?? 20);

function getRateBucket(key: string, now: number) {
  const existing = rateBuckets.get(key);
  if (existing && existing.resetAt > now) {
    return existing;
  }
  const next = { count: 0, resetAt: now + wsWindowMs };
  rateBuckets.set(key, next);
  return next;
}

export function checkWsRateLimit(connectionId: string, channel: "chat" | "action") {
  const key = `${connectionId}:${channel}`;
  const now = Date.now();
  const bucket = getRateBucket(key, now);
  bucket.count += 1;
  if (bucket.count > wsMax) {
    return { ok: false as const };
  }
  return { ok: true as const };
}

export function parseTableId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseSeatId(value: unknown) {
  const seatId = Number(value);
  if (!Number.isInteger(seatId) || seatId < seatMin || seatId > seatMax) {
    return null;
  }
  return seatId;
}

export function parseActionType(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  return allowedActions.has(value) ? value : null;
}

export function parseChatMessage(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return { ok: false as const, reason: "empty_message" };
  }
  if (text.length > maxChatLength) {
    return { ok: false as const, reason: "message_too_long" };
  }
  return { ok: true as const, text };
}

export function resetWsRateLimit() {
  rateBuckets.clear();
}
