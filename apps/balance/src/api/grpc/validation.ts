import { toNonEmptyString, toNumber } from '../validation';

export class InvalidArgumentError extends Error {
  override name = 'InvalidArgumentError';
}

function invalidArgument(message: string): never {
  throw new InvalidArgumentError(message);
}

export function requireNonEmptyString(value: unknown, fieldName: string): string {
  const parsed = toNonEmptyString(value);
  if (!parsed) {
    invalidArgument(`${fieldName} is required`);
  }
  return parsed;
}

export function optionalNonEmptyString(value: unknown): string | undefined {
  return toNonEmptyString(value) ?? undefined;
}

export function requirePositiveNumber(value: unknown, fieldName: string): number {
  const parsed = toNumber(value, Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    invalidArgument(`${fieldName} must be a positive number`);
  }
  return parsed;
}

export function requireNonNegativeNumber(value: unknown, fieldName: string): number {
  const parsed = toNumber(value, Number.NaN);
  if (!Number.isFinite(parsed) || parsed < 0) {
    invalidArgument(`${fieldName} must be a non-negative number`);
  }
  return parsed;
}

export function requireNonNegativeInt(value: unknown, fieldName: string): number {
  const parsed = toNumber(value, Number.NaN);
  if (!Number.isInteger(parsed) || parsed < 0) {
    invalidArgument(`${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

export function optionalPositiveNumber(value: unknown): number | undefined {
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
