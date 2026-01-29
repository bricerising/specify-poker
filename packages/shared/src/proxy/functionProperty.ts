export type AnyFunction = (...args: unknown[]) => unknown;

export function getFunctionProperty(target: object, prop: string): AnyFunction | null {
  const value = (target as Record<string, unknown>)[prop];
  if (typeof value !== 'function') {
    return null;
  }

  // Avoid accidentally treating `Object.prototype` methods (e.g. `toString`) as RPC methods.
  // These are common property reads on objects and can lead to confusing hangs if invoked.
  const objectProtoValue = (Object.prototype as Record<string, unknown>)[prop];
  if (typeof objectProtoValue === 'function' && objectProtoValue === value) {
    return null;
  }

  return value as AnyFunction;
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
