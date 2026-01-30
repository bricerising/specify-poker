import { incrementRateLimit } from '../storage/rateLimitStore';
import { readIntEnv } from '@specify-poker/shared';

const allowedActions = {
  Fold: 'FOLD',
  Check: 'CHECK',
  Call: 'CALL',
  Bet: 'BET',
  Raise: 'RAISE',
} as const;
type AllowedActionType = (typeof allowedActions)[keyof typeof allowedActions];
const maxChatLength = 500;
const seatMin = 0;
const seatMax = 8;

const wsWindowMs = readIntEnv(process.env, 'WS_RATE_LIMIT_WINDOW_MS', 10_000, { min: 1 });
const wsMax = readIntEnv(process.env, 'WS_RATE_LIMIT_MAX', 20, { min: 1 });

export async function checkWsRateLimit(userId: string, ip: string, channel: 'chat' | 'action') {
  const userKey = `ratelimit:ws:user:${userId}:${channel}`;
  const ipKey = `ratelimit:ws:ip:${ip}:${channel}`;
  const userCount = await incrementRateLimit(userKey, wsWindowMs);
  const ipCount = await incrementRateLimit(ipKey, wsWindowMs);
  return { ok: userCount <= wsMax && ipCount <= wsMax };
}

export function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseTableId(value: unknown) {
  if (typeof value !== 'string') {
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
  if (typeof value !== 'string') {
    return null;
  }
  return (allowedActions as Record<string, AllowedActionType | undefined>)[value] ?? null;
}

export function parseChatMessage(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return { ok: false as const, reason: 'empty_message' };
  }
  if (text.length > maxChatLength) {
    return { ok: false as const, reason: 'message_too_long' };
  }
  return { ok: true as const, text };
}
