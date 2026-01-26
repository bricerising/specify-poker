import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../../auth/jwt";
import logger from "../../observability/logger";

export interface AuthContext {
  userId: string;
  token: string;
  claims: Record<string, unknown>;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

function deny(res: Response, reason: string) {
  res.status(401).json({ code: "auth_denied", message: reason });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") {
    return next();
  }

  // Health and metrics might be public or handled elsewhere, but for now let's exclude them if needed
  if (req.path === "/health" || req.path === "/ready" || req.path === "/metrics") {
    return next();
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return deny(res, "Missing bearer token");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return deny(res, "Missing bearer token");
  }

  try {
    const claims = await verifyToken(token);
    const userId = claims.sub;
    if (!userId) {
      return deny(res, "Missing subject");
    }
    
    req.auth = {
      userId,
      token,
      claims,
    };
    
    return next();
  } catch (err: unknown) {
    logger.warn({ err }, "auth.failed");
    return deny(res, "Invalid token");
  }
}
