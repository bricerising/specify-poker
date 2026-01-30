export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (value.length === 0) {
    return null;
  }

  return value;
}

export function asOptionalString(value: unknown): string | undefined {
  return asNonEmptyString(value) ?? undefined;
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

