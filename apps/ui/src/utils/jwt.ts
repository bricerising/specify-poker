import { asRecord, readTrimmedString } from "./unknown";

type BufferLike = { toString: (encoding: string) => string };
type BufferFrom = (value: string, encoding: string) => BufferLike;

function decodeBase64ToString(base64: string): string | null {
  if (typeof globalThis.atob === "function") {
    try {
      return globalThis.atob(base64);
    } catch {
      return null;
    }
  }

  const maybeBuffer = (globalThis as unknown as { Buffer?: { from?: unknown } }).Buffer;
  const maybeFrom = maybeBuffer?.from;
  if (typeof maybeFrom === "function") {
    try {
      return (maybeFrom as BufferFrom)(base64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }

  return null;
}

export function decodeJwtUserId(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, "=");

  const decoded = decodeBase64ToString(padded);
  if (!decoded) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(decoded);
    const record = asRecord(parsed);
    return record ? readTrimmedString(record.sub) : null;
  } catch {
    return null;
  }
}
