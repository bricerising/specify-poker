import type { EventType } from '../../../domain/types';
import { isEventType } from '../../../domain/types';
import { InvalidArgumentError, isRecord } from '../../../errors';
import type { ProtoTimestamp } from '../types';

export function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidArgumentError(`${fieldName} is required`);
  }
  return value;
}

export function optionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

export function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidArgumentError(`${fieldName} must be an object`);
  }
  return value;
}

export function coercePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function coerceNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function parseEventType(value: unknown): EventType {
  if (!isEventType(value)) {
    throw new InvalidArgumentError(`Unknown event type: ${String(value)}`);
  }
  return value;
}

export function parseEventTypes(values: unknown): EventType[] | undefined {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }
  return values.map(parseEventType);
}

export function timestampToDate(timestamp?: ProtoTimestamp): Date | undefined {
  if (!timestamp) {
    return undefined;
  }
  if (typeof timestamp.seconds !== 'number' || !Number.isFinite(timestamp.seconds)) {
    throw new InvalidArgumentError('timestamp.seconds must be a number');
  }
  const nanos =
    typeof timestamp.nanos === 'number' && Number.isFinite(timestamp.nanos) ? timestamp.nanos : 0;
  return new Date(timestamp.seconds * 1000 + Math.floor(nanos / 1_000_000));
}
