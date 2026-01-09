import { NextFunction, Request, Response } from "express";

import { verifyToken } from "../../auth/jwt";

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
  console.warn("auth.denied", { reason });
  res.status(401).json({ code: "auth_denied", message: reason });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") {
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
    req.auth = {
      userId: claims.sub ?? "unknown",
      token,
      claims,
    };
    return next();
  } catch {
    return deny(res, "Invalid token");
  }
}
