export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function safeJsonParseRecord(text: string): Record<string, unknown> | null {
  const parsed = safeJsonParse(text);
  return isRecord(parsed) ? parsed : null;
}

