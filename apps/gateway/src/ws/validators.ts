import { incrementRateLimit } from "../storage/rateLimitStore";

const allowedActions = new Map([
  ["Fold", "FOLD"],
  ["Check", "CHECK"],
  ["Call", "CALL"],
  ["Bet", "BET"],
  ["Raise", "RAISE"],
]);
const maxChatLength = 500;
const seatMin = 0;
const seatMax = 8;

const wsWindowMs = Number(process.env.WS_RATE_LIMIT_WINDOW_MS ?? 10000);
const wsMax = Number(process.env.WS_RATE_LIMIT_MAX ?? 20);

export async function checkWsRateLimit(
  userId: string,
  ip: string,
  channel: "chat" | "action",
) {
  const userKey = `ratelimit:ws:user:${userId}:${channel}`;
  const ipKey = `ratelimit:ws:ip:${ip}:${channel}`;
  const userCount = await incrementRateLimit(userKey, wsWindowMs);
  const ipCount = await incrementRateLimit(ipKey, wsWindowMs);
  return { ok: userCount <= wsMax && ipCount <= wsMax };
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
  return allowedActions.get(value) ?? null;
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
