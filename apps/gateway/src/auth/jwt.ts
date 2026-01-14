import jwt, { Algorithm, JwtPayload } from "jsonwebtoken";
import { getConfig } from "../config";

export type VerifiedToken = JwtPayload & { sub?: string };

let cachedPublicKey: string | null = null;
const jwksCache = new Map<string, string>();

function wrapPemLines(input: string) {
  return input.match(/.{1,64}/g)?.join("\n") ?? input;
}

function formatPublicKey(input: string) {
  if (input.includes("BEGIN PUBLIC KEY")) {
    return input;
  }
  return `-----BEGIN PUBLIC KEY-----\n${wrapPemLines(input)}\n-----END PUBLIC KEY-----`;
}

function formatCertificate(input: string) {
  if (input.includes("BEGIN CERTIFICATE")) {
    return input;
  }
  return `-----BEGIN CERTIFICATE-----\n${wrapPemLines(input)}\n-----END CERTIFICATE-----`;
}

async function fetchPublicKey() {
  if (cachedPublicKey) {
    return cachedPublicKey;
  }
  const keycloakUrl = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
  const realm = process.env.KEYCLOAK_REALM ?? "poker-local";
  const response = await fetch(`${keycloakUrl}/realms/${realm}`);
  if (!response.ok) {
    throw new Error(`Failed to load Keycloak realm config (${response.status})`);
  }
  const payload = (await response.json()) as { public_key?: string };
  if (!payload.public_key) {
    throw new Error("Keycloak realm public key missing");
  }
  cachedPublicKey = formatPublicKey(payload.public_key);
  return cachedPublicKey;
}

async function fetchJwksKey(kid: string) {
  const cached = jwksCache.get(kid);
  if (cached) {
    return cached;
  }
  const keycloakUrl = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
  const realm = process.env.KEYCLOAK_REALM ?? "poker-local";
  const response = await fetch(
    `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load Keycloak JWKS (${response.status})`);
  }
  const payload = (await response.json()) as { keys?: Array<{ kid?: string; x5c?: string[] }> };
  const match = payload.keys?.find((key) => key.kid === kid);
  const cert = match?.x5c?.[0];
  if (!cert) {
    throw new Error("Keycloak JWKS does not include matching certificate");
  }
  const formatted = formatCertificate(cert);
  jwksCache.set(kid, formatted);
  return formatted;
}

export async function verifyToken(token: string): Promise<VerifiedToken> {
  const config = getConfig();
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;
  const secret = process.env.JWT_HS256_SECRET ?? config.jwtSecret;
  const decoded = jwt.decode(token, { complete: true });
  const header = decoded && typeof decoded === "object" ? decoded.header : null;

  const publicKey = process.env.JWT_PUBLIC_KEY
    ? formatPublicKey(process.env.JWT_PUBLIC_KEY)
    : null;

  let key = publicKey;
  if (!key) {
    const kid = header?.kid;
    if (kid) {
      key = await fetchJwksKey(kid);
    } else if (secret) {
      key = secret;
    } else {
      key = await fetchPublicKey();
    }
  }

  if (!key) {
    throw new Error("JWT verification key is missing");
  }

  const algorithms: Algorithm[] = secret && !publicKey && !header?.kid ? ["HS256"] : ["RS256"];

  return jwt.verify(token, key, {
    algorithms,
    issuer,
    audience,
  }) as VerifiedToken;
}
