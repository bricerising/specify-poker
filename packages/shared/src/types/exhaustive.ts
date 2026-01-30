/**
 * Exhaustiveness checking utilities for discriminated unions.
 *
 * Use `assertNever` in the default case of switch statements to get
 * compile-time errors when new variants are added to a union.
 *
 * @example
 * ```ts
 * type Action = { type: 'increment' } | { type: 'decrement' };
 *
 * function reducer(action: Action): number {
 *   switch (action.type) {
 *     case 'increment':
 *       return 1;
 *     case 'decrement':
 *       return -1;
 *     default:
 *       // Compile error if a new action type is added but not handled
 *       return assertNever(action);
 *   }
 * }
 * ```
 */

/**
 * Asserts that a value is of type `never`, indicating exhaustive handling.
 * Throws at runtime if reached (indicates a bug or unhandled case).
 *
 * @param value - The value that should be `never` if all cases are handled
 * @param message - Optional custom error message
 * @throws Error if this function is ever called at runtime
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}

/**
 * Type-only exhaustiveness check that doesn't throw.
 * Use when you want compile-time checking but have a sensible default.
 *
 * @example
 * ```ts
 * function getLabel(status: Status): string {
 *   switch (status) {
 *     case 'active': return 'Active';
 *     case 'inactive': return 'Inactive';
 *     default:
 *       exhaustiveCheck(status);
 *       return 'Unknown';
 *   }
 * }
 * ```
 */
export function exhaustiveCheck(_value: never): void {
  // This function body is intentionally empty.
  // It exists only for compile-time exhaustiveness checking.
}
