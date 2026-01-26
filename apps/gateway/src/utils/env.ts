export type IntEnvOptions = {
  min?: number;
  max?: number;
};

export function readIntEnv(name: string, fallback: number, options: IntEnvOptions = {}): number {
  const raw = process.env[name];
  if (typeof raw !== "string") {
    return fallback;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return fallback;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  if (options.min !== undefined && parsed < options.min) {
    return fallback;
  }
  if (options.max !== undefined && parsed > options.max) {
    return fallback;
  }

  return parsed;
}

export function readStringEnv(name: string, fallback: string): string {
  const raw = process.env[name];
  if (typeof raw !== "string") {
    return fallback;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

