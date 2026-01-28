export type JsonParseResult<T> = { ok: true; value: T } | { ok: false; error: Error };

export function tryJsonParse<T>(input: string): JsonParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(input) as T };
  } catch (error: unknown) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    return { ok: false, error: normalized };
  }
}
