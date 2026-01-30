export function toNumber(value: unknown, fallback = 0): number {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate;
  }
  if (typeof candidate === 'string') {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function toNonEmptyString(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return String(candidate);
  }
  return null;
}
