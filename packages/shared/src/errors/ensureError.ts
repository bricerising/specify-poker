export function ensureError(value: unknown, fallbackMessage = "Unknown error"): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === "string") {
    return new Error(value);
  }

  return new Error(fallbackMessage, { cause: value });
}

