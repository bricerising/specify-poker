import { verifyToken } from "../auth/jwt";
import logger from "../observability/logger";
import { IncomingMessage } from "http";

export type WsAuthResult =
  | { status: "ok"; userId: string }
  | { status: "missing" }
  | { status: "invalid"; reason: string };

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
    return { status: "ok", userId };
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
    return { status: "ok", userId };
  } catch (error) {
    logger.warn({ err: error }, "WS authentication failed");
    return { status: "invalid", reason: "invalid_token" };
  }
}
