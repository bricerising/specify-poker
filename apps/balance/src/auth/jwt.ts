import jwt, { Algorithm, JwtPayload } from "jsonwebtoken";
import {
  createKeycloakKeyProvider,
  formatPublicKeyPem,
  readJwtHeaderKid,
  resolveJwtVerificationMaterial,
  type KeycloakKeyProvider,
} from "@specify-poker/shared";
import { getConfig } from "../config";

export type VerifiedToken = JwtPayload & { sub?: string };

let keyProvider: KeycloakKeyProvider | null = null;

function getKeyProvider(): KeycloakKeyProvider {
  if (keyProvider) {
    return keyProvider;
  }

  const keycloakUrl = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
  const realm = process.env.KEYCLOAK_REALM ?? "poker-local";

  keyProvider = createKeycloakKeyProvider({ keycloakUrl, realm });
  return keyProvider;
}

export async function verifyToken(token: string): Promise<VerifiedToken> {
  const config = getConfig();
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;
  const secret = process.env.JWT_HS256_SECRET ?? config.jwtSecret;
  const kid = readJwtHeaderKid(token);

  const publicKeyPem = process.env.JWT_PUBLIC_KEY ? formatPublicKeyPem(process.env.JWT_PUBLIC_KEY) : null;
  const { key, algorithms } = await resolveJwtVerificationMaterial({
    keyProvider: getKeyProvider(),
    kid,
    publicKeyPem,
    hs256Secret: secret,
  });

  const verified = jwt.verify(token, key, {
    algorithms: algorithms.map((alg) => alg as Algorithm),
    issuer,
    audience,
  });

  if (typeof verified === "string") {
    throw new Error("jwt.verify returned string payload");
  }

  return verified as VerifiedToken;
}
