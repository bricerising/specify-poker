import { verifyToken } from "../auth/jwt";
import { normalizeUsernameFromClaims } from "../auth/claims";
import logger from "../observability/logger";
import { IncomingMessage } from "http";

export type WsAuthResult =
  | { status: "ok"; userId: string; username?: string }
  | { status: "missing" }
  | { status: "invalid"; reason: string };

async function authenticateToken(token: string): Promise<WsAuthResult> {
  try {
    const claims = await verifyToken(token);
    const userId = claims.sub;
    if (!userId) {
      throw new Error("Missing sub in token");
    }
    const username = normalizeUsernameFromClaims(claims);
    return { status: "ok", userId, ...(username ? { username } : {}) };
  } catch (err: unknown) {
    logger.warn({ err }, "WS authentication failed");
    return { status: "invalid", reason: "invalid_token" };
  }
}

export async function authenticateWs(request: IncomingMessage): Promise<WsAuthResult> {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const token = url.searchParams.get("token");

  if (typeof token !== "string" || token.trim().length === 0) {
    return { status: "missing" };
  }

  return authenticateToken(token);
}

export async function authenticateWsToken(token: string): Promise<WsAuthResult> {
  if (token.trim().length === 0) {
    return { status: "invalid", reason: "missing_token" };
  }

  return authenticateToken(token);
}
