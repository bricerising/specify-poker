import type WebSocket from 'ws';
import type { z } from 'zod';

export function rawDataToString(data: WebSocket.RawData): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

export function parseJsonObject(data: WebSocket.RawData): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawDataToString(data));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseJsonWithSchema<TSchema extends z.ZodTypeAny>(
  data: WebSocket.RawData,
  schema: TSchema,
): z.infer<TSchema> | null {
  const obj = parseJsonObject(data);
  if (!obj) {
    return null;
  }
  const parsed = schema.safeParse(obj);
  return parsed.success ? parsed.data : null;
}
