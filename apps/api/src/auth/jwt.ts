import jwt, { JwtPayload } from "jsonwebtoken";

export type VerifiedToken = JwtPayload & { sub?: string };

export function verifyToken(token: string): VerifiedToken {
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;
  const publicKey = process.env.JWT_PUBLIC_KEY;
  const secret = process.env.JWT_HS256_SECRET;
  const key = publicKey ?? secret;

  if (!key) {
    throw new Error("JWT verification key is missing");
  }

  const algorithms = publicKey ? ["RS256"] : ["HS256"];

  return jwt.verify(token, key, {
    algorithms,
    issuer,
    audience,
  }) as VerifiedToken;
}
