import type { KeycloakKeyProvider } from './keycloakKeys';

export type JwtVerificationMaterial = {
  key: string;
  algorithms: ['HS256'] | ['RS256'];
};

export async function resolveJwtVerificationMaterial(options: {
  keyProvider: KeycloakKeyProvider;
  kid?: string | null;
  publicKeyPem?: string | null;
  hs256Secret?: string | null;
}): Promise<JwtVerificationMaterial> {
  const kid = options.kid ?? null;
  const publicKeyPem = options.publicKeyPem ?? null;
  const hs256Secret = options.hs256Secret ?? null;

  if (hs256Secret && !publicKeyPem && !kid) {
    return { key: hs256Secret, algorithms: ['HS256'] };
  }

  if (publicKeyPem) {
    return { key: publicKeyPem, algorithms: ['RS256'] };
  }

  if (kid) {
    return { key: await options.keyProvider.getJwksCertificatePem(kid), algorithms: ['RS256'] };
  }

  return { key: await options.keyProvider.getRealmPublicKeyPem(), algorithms: ['RS256'] };
}
