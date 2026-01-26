export function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function parseEnvInt(
  env: NodeJS.ProcessEnv,
  keys: readonly string[],
  fallback: number,
): number {
  for (const key of keys) {
    const raw = env[key];
    if (raw === undefined) {
      continue;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export function parseEnvString(
  env: NodeJS.ProcessEnv,
  keys: readonly string[],
  fallback: string,
): string {
  for (const key of keys) {
    const raw = env[key];
    if (typeof raw === "string" && raw.length > 0) {
      return raw;
    }
  }
  return fallback;
}
