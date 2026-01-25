import { verifyToken } from "../auth/jwt";
import logger from "../observability/logger";
import { IncomingMessage } from "http";

export type WsAuthResult =
  | { status: "ok"; userId: string; username?: string }
  | { status: "missing" }
  | { status: "invalid"; reason: string };

function normalizeUsernameFromClaims(claims: Record<string, unknown>): string | null {
  const candidates = [
    claims.preferred_username,
    claims.username,
    claims.nickname,
    claims.email,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

export async function authenticateWs(request: IncomingMessage): Promise<WsAuthResult> {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    return { status: "missing" };
  }

  try {
    const claims = await verifyToken(token);
    const userId = claims.sub;
    if (!userId) {
      throw new Error("Missing sub in token");
    }
    const username = normalizeUsernameFromClaims(claims as unknown as Record<string, unknown>);
    return { status: "ok", userId, ...(username ? { username } : {}) };
  } catch (error) {
    logger.warn({ err: error }, "WS authentication failed");
    return { status: "invalid", reason: "invalid_token" };
  }
}

export async function authenticateWsToken(token: string): Promise<WsAuthResult> {
  if (!token) {
    return { status: "invalid", reason: "missing_token" };
  }
  try {
    const claims = await verifyToken(token);
    const userId = claims.sub;
    if (!userId) {
      throw new Error("Missing sub in token");
    }
    const username = normalizeUsernameFromClaims(claims as unknown as Record<string, unknown>);
    return { status: "ok", userId, ...(username ? { username } : {}) };
  } catch (error) {
    logger.warn({ err: error }, "WS authentication failed");
    return { status: "invalid", reason: "invalid_token" };
  }
}
