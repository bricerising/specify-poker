import { createLazyValue, type LazyValue } from '../lifecycle/lazyValue';
import {
  createKeycloakKeyProvider,
  formatPublicKeyPem,
  type CreateKeycloakKeyProviderOptions,
  type KeycloakKeyProvider,
} from './keycloakKeys';
import { readJwtHeaderKid } from './jwtKid';
import { resolveJwtVerificationMaterial } from './jwtVerification';

export type JwtAlgorithm = 'HS256' | 'RS256';

export type JwtVerifyOptions = {
  algorithms: readonly JwtAlgorithm[];
  issuer?: string;
  audience?: string;
};

export type JwtVerifyFn<TResult> = (token: string, key: string, options: JwtVerifyOptions) => TResult;

export type JwtTokenVerifier<TResult> = {
  verifyToken(token: string): Promise<TResult>;
  resetForTests(): void;
};

export type CreateJwtTokenVerifierOptions<TResult> = {
  verify: JwtVerifyFn<TResult>;
  env?: Record<string, string | undefined>;
  getFallbackHs256Secret?: () => string | null | undefined;
  createKeyProvider?: (options: CreateKeycloakKeyProviderOptions) => KeycloakKeyProvider;
  keycloakUrlFallback?: string;
  keycloakRealmFallback?: string;
};

type Env = Record<string, string | undefined>;

function defaultEnv(): Env {
  const maybeProcess = (globalThis as unknown as { process?: { env?: Env } }).process;
  return maybeProcess?.env ?? {};
}

function createLazyKeyProvider(
  create: () => KeycloakKeyProvider,
): { lazyValue: LazyValue<KeycloakKeyProvider>; proxy: KeycloakKeyProvider } {
  const lazyValue = createLazyValue(create);

  return {
    lazyValue,
    proxy: {
      getRealmPublicKeyPem: () => lazyValue.get().getRealmPublicKeyPem(),
      getJwksCertificatePem: (kid) => lazyValue.get().getJwksCertificatePem(kid),
    },
  };
}

/**
 * Factory for a JWT verifier that supports:
 * - HS256 via `JWT_HS256_SECRET` (or fallback secret)
 * - RS256 via `JWT_PUBLIC_KEY`
 * - RS256 via Keycloak JWKS (`kid`) or realm public key
 *
 * This keeps env and runtime dependencies explicit and makes verification easy to test
 * by injecting a `verify(...)` implementation.
 */
export function createJwtTokenVerifier<TResult>(
  options: CreateJwtTokenVerifierOptions<TResult>,
): JwtTokenVerifier<TResult> {
  const env = options.env ?? defaultEnv();
  const createKeyProvider =
    options.createKeyProvider ?? ((keycloakOptions) => createKeycloakKeyProvider(keycloakOptions));

  const { lazyValue: keyProviderLazyValue, proxy: lazyKeyProvider } = createLazyKeyProvider(() => {
    const keycloakUrl = env.KEYCLOAK_URL ?? (options.keycloakUrlFallback ?? 'http://localhost:8080');
    const realm = env.KEYCLOAK_REALM ?? (options.keycloakRealmFallback ?? 'poker-local');

    return createKeyProvider({ keycloakUrl, realm });
  });

  return {
    verifyToken: async (token: string) => {
      const issuer = env.JWT_ISSUER;
      const audience = env.JWT_AUDIENCE;
      const fallbackSecret = options.getFallbackHs256Secret?.() ?? null;
      const hs256Secret = (env.JWT_HS256_SECRET ?? fallbackSecret) ?? null;
      const kid = readJwtHeaderKid(token);
      const publicKeyPem = env.JWT_PUBLIC_KEY ? formatPublicKeyPem(env.JWT_PUBLIC_KEY) : null;

      const { key, algorithms } = await resolveJwtVerificationMaterial({
        keyProvider: lazyKeyProvider,
        kid,
        publicKeyPem,
        hs256Secret,
      });

      return options.verify(token, key, { algorithms, issuer, audience });
    },
    resetForTests: () => {
      keyProviderLazyValue.reset();
    },
  };
}

