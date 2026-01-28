type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type KeycloakKeyProvider = {
  getRealmPublicKeyPem(): Promise<string>;
  getJwksCertificatePem(kid: string): Promise<string>;
};

export type CreateKeycloakKeyProviderOptions = {
  keycloakUrl: string;
  realm: string;
  timeoutMs?: number;
  fetch?: FetchLike;
};

export function createKeycloakKeyProvider(
  options: CreateKeycloakKeyProviderOptions,
): KeycloakKeyProvider {
  const fetchFn: FetchLike =
    options.fetch ?? (globalThis.fetch as FetchLike | undefined) ?? missingFetch();
  const timeoutMs = options.timeoutMs ?? 2_000;

  let cachedRealmPublicKey: string | null = null;
  let realmPublicKeyInFlight: Promise<string> | null = null;

  const jwksCertCache = new Map<string, string>();
  const jwksCertInFlight = new Map<string, Promise<string>>();

  const realmConfigUrl = `${options.keycloakUrl}/realms/${options.realm}`;
  const jwksUrl = `${realmConfigUrl}/protocol/openid-connect/certs`;

  return {
    getRealmPublicKeyPem: async () => {
      if (cachedRealmPublicKey) {
        return cachedRealmPublicKey;
      }

      if (!realmPublicKeyInFlight) {
        realmPublicKeyInFlight = (async () => {
          const payload = await fetchJson(realmConfigUrl, fetchFn, timeoutMs);
          const publicKey = readStringField(payload, 'public_key');
          if (!publicKey) {
            throw new Error('Keycloak realm public key missing');
          }
          const formatted = formatPublicKeyPem(publicKey);
          cachedRealmPublicKey = formatted;
          return formatted;
        })().finally(() => {
          realmPublicKeyInFlight = null;
        });
      }

      return realmPublicKeyInFlight;
    },

    getJwksCertificatePem: async (kid: string) => {
      const cached = jwksCertCache.get(kid);
      if (cached) {
        return cached;
      }

      const inFlight = jwksCertInFlight.get(kid);
      if (inFlight) {
        return inFlight;
      }

      const promise = (async () => {
        const payload = await fetchJson(jwksUrl, fetchFn, timeoutMs);
        const keys = readArrayField(payload, 'keys');
        const cert = findJwksX5cCert(keys, kid);
        if (!cert) {
          throw new Error('Keycloak JWKS does not include matching certificate');
        }

        const formatted = formatCertificatePem(cert);
        jwksCertCache.set(kid, formatted);
        return formatted;
      })().finally(() => {
        jwksCertInFlight.delete(kid);
      });

      jwksCertInFlight.set(kid, promise);
      return promise;
    },
  };
}

export function formatPublicKeyPem(input: string): string {
  return formatPemBlock('PUBLIC KEY', input);
}

export function formatCertificatePem(input: string): string {
  return formatPemBlock('CERTIFICATE', input);
}

function missingFetch(): FetchLike {
  return () => {
    throw new Error('fetch is not available in this environment');
  };
}

async function fetchJson(url: string, fetchFn: FetchLike, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url} (${response.status})`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function formatPemBlock(blockType: string, input: string): string {
  const begin = `BEGIN ${blockType}`;
  if (input.includes(begin)) {
    return input;
  }
  return `-----${begin}-----\n${wrapPemLines(input)}\n-----END ${blockType}-----`;
}

function wrapPemLines(input: string): string {
  return input.match(/.{1,64}/g)?.join('\n') ?? input;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringField(value: unknown, field: string): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const candidate = value[field];
  return typeof candidate === 'string' ? candidate : null;
}

function readArrayField(value: unknown, field: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const candidate = value[field];
  return Array.isArray(candidate) ? candidate : [];
}

function findJwksX5cCert(keys: unknown[], kid: string): string | null {
  for (const key of keys) {
    if (!isRecord(key)) {
      continue;
    }
    if (typeof key.kid !== 'string' || key.kid !== kid) {
      continue;
    }
    if (!Array.isArray(key.x5c) || typeof key.x5c[0] !== 'string') {
      return null;
    }
    return key.x5c[0];
  }

  return null;
}
