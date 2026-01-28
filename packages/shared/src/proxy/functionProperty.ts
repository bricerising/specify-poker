export type AnyFunction = (...args: unknown[]) => unknown;

export function getFunctionProperty(target: object, prop: string): AnyFunction | null {
  const value = (target as Record<string, unknown>)[prop];
  return typeof value === 'function' ? (value as AnyFunction) : null;
}

export function requireFunctionProperty(
  target: object,
  prop: string,
  errorPrefix: string,
): AnyFunction {
  const fn = getFunctionProperty(target, prop);
  if (!fn) {
    throw new Error(`${errorPrefix}:${String(prop)}`);
  }
  return fn;
}
