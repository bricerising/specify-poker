function decodeBase64Url(input: string): string | null {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");

  try {
    if (typeof globalThis.atob === "function") {
      return globalThis.atob(base64);
    }
  } catch {
    // Ignore.
  }

  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(base64, "base64").toString("utf8");
    }
  } catch {
    // Ignore.
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Best-effort reader for `kid` (key id) in a JWT header.
 *
 * Note: this does not validate the token or signature.
 */
export function readJwtHeaderKid(token: string): string | null {
  const [headerSegment] = token.split(".");
  if (!headerSegment) {
    return null;
  }

  const decoded = decodeBase64Url(headerSegment);
  if (!decoded) {
    return null;
  }

  try {
    const header = JSON.parse(decoded) as unknown;
    if (!isRecord(header)) {
      return null;
    }

    return typeof header.kid === "string" ? header.kid : null;
  } catch {
    return null;
  }
}

