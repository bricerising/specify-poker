/**
 * Shared Result type for typed error handling across services.
 *
 * This module provides a standard way to represent success/failure outcomes
 * without using exceptions for expected failures. The Result type makes
 * error handling explicit in function signatures.
 *
 * @example
 * ```ts
 * type GetUserError = "NOT_FOUND" | "DB_ERROR";
 *
 * function getUser(id: string): Result<User, GetUserError> {
 *   const user = db.find(id);
 *   if (!user) return err("NOT_FOUND");
 *   return ok(user);
 * }
 *
 * const result = getUser("123");
 * if (result.ok) {
 *   console.log(result.value.name);
 * } else {
 *   console.log(result.error); // Type-safe error handling
 * }
 * ```
 */

import { ensureError } from '../errors/ensureError';

/** Represents a successful result containing a value */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Represents a failed result containing an error */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Discriminated union representing either success or failure */
export type Result<T, E> = Ok<T> | Err<E>;

/** Creates a successful result */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Creates a failed result */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard for checking if a result is successful */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Type guard for checking if a result is a failure */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Maps the success value of a Result to a new value.
 * If the result is an error, returns the error unchanged.
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Maps the error of a Result to a new error.
 * If the result is successful, returns the success unchanged.
 */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chains Result-returning operations.
 * If the result is successful, applies the function to the value.
 * If the result is an error, returns the error unchanged.
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/**
 * Unwraps a Result, returning the value or throwing the error.
 * Use sparingly - prefer pattern matching on ok/error.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

/**
 * Unwraps a Result, returning the value or a default.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Converts a Promise that might reject to a Promise<Result>.
 * Catches any thrown errors and wraps them in an Err.
 */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<Result<T, Error>>;
export async function tryCatch<T, E>(
  fn: () => Promise<T>,
  mapError: (error: unknown) => E,
): Promise<Result<T, E>>;
export async function tryCatch<T, E>(
  fn: () => Promise<T>,
  mapError?: (error: unknown) => E,
): Promise<Result<T, E | Error>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error: unknown) {
    if (mapError) {
      return err(mapError(error));
    }
    return err(ensureError(error));
  }
}

/**
 * Converts a synchronous function that might throw to a Result.
 */
export function tryCatchSync<T>(fn: () => T): Result<T, Error>;
export function tryCatchSync<T, E>(fn: () => T, mapError: (error: unknown) => E): Result<T, E>;
export function tryCatchSync<T, E>(
  fn: () => T,
  mapError?: (error: unknown) => E,
): Result<T, E | Error> {
  try {
    const value = fn();
    return ok(value);
  } catch (error: unknown) {
    if (mapError) {
      return err(mapError(error));
    }
    return err(ensureError(error));
  }
}
