import { isRecord } from '../errors';

export function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function safeJsonParseRecord(value: string): Record<string, unknown> | null {
  const parsed = safeJsonParse(value);
  return isRecord(parsed) ? parsed : null;
}

