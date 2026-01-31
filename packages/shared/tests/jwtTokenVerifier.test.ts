import { describe, expect, it, vi } from 'vitest';
import { createJwtTokenVerifier } from '../src/auth/jwtTokenVerifier';

function base64UrlEncode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createTestJwt(header: Record<string, unknown>): string {
  const headerSegment = base64UrlEncode({ typ: 'JWT', alg: 'RS256', ...header });
  const payloadSegment = base64UrlEncode({});
  return `${headerSegment}.${payloadSegment}.sig`;
}

describe('createJwtTokenVerifier', () => {
  it('uses configured HS256 secret when present (and does not create a key provider)', async () => {
    const createKeyProvider = vi.fn();
    const verify = vi.fn().mockReturnValue({ ok: true });

    const verifier = createJwtTokenVerifier({
      env: { JWT_HS256_SECRET: 'shared-secret' },
      createKeyProvider,
      verify,
    });

    const token = createTestJwt({});
    await verifier.verifyToken(token);

    expect(createKeyProvider).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledWith(
      token,
      'shared-secret',
      expect.objectContaining({ algorithms: ['HS256'] }),
    );
  });

  it('prefers public key over HS256 secret', async () => {
    const createKeyProvider = vi.fn();
    const verify = vi.fn().mockReturnValue({ ok: true });

    const verifier = createJwtTokenVerifier({
      env: { JWT_HS256_SECRET: 'shared-secret', JWT_PUBLIC_KEY: 'PUBLICKEY' },
      createKeyProvider,
      verify,
    });

    const token = createTestJwt({});
    await verifier.verifyToken(token);

    expect(createKeyProvider).not.toHaveBeenCalled();
    expect(verify).toHaveBeenCalledWith(
      token,
      expect.stringContaining('BEGIN PUBLIC KEY'),
      expect.objectContaining({ algorithms: ['RS256'] }),
    );
  });

  it('uses JWKS certificate when token header has kid', async () => {
    const getJwksCertificatePem = vi.fn().mockResolvedValue('CERTPEM');
    const createKeyProvider = vi.fn().mockReturnValue({
      getRealmPublicKeyPem: vi.fn(),
      getJwksCertificatePem,
    });

    const verify = vi.fn().mockReturnValue({ ok: true });

    const verifier = createJwtTokenVerifier({
      env: {},
      createKeyProvider,
      verify,
    });

    const token = createTestJwt({ kid: 'kid-1' });
    await verifier.verifyToken(token);

    expect(createKeyProvider).toHaveBeenCalledTimes(1);
    expect(getJwksCertificatePem).toHaveBeenCalledWith('kid-1');
    expect(verify).toHaveBeenCalledWith(
      token,
      'CERTPEM',
      expect.objectContaining({ algorithms: ['RS256'] }),
    );
  });

  it('passes issuer and audience to verify function', async () => {
    const getRealmPublicKeyPem = vi.fn().mockResolvedValue('REALMKEY');
    const createKeyProvider = vi.fn().mockReturnValue({
      getRealmPublicKeyPem,
      getJwksCertificatePem: vi.fn(),
    });

    const verify = vi.fn().mockReturnValue({ ok: true });

    const verifier = createJwtTokenVerifier({
      env: { JWT_ISSUER: 'issuer-1', JWT_AUDIENCE: 'aud-1' },
      createKeyProvider,
      verify,
    });

    const token = createTestJwt({});
    await verifier.verifyToken(token);

    expect(verify).toHaveBeenCalledWith(
      token,
      'REALMKEY',
      expect.objectContaining({ issuer: 'issuer-1', audience: 'aud-1' }),
    );
  });

  it('can reset key provider for tests', async () => {
    const createKeyProvider = vi.fn().mockReturnValue({
      getRealmPublicKeyPem: vi.fn().mockResolvedValue('REALMKEY'),
      getJwksCertificatePem: vi.fn(),
    });

    const verify = vi.fn().mockReturnValue({ ok: true });

    const verifier = createJwtTokenVerifier({
      env: {},
      createKeyProvider,
      verify,
    });

    const token = createTestJwt({});
    await verifier.verifyToken(token);
    await verifier.verifyToken(token);

    expect(createKeyProvider).toHaveBeenCalledTimes(1);

    verifier.resetForTests();
    await verifier.verifyToken(token);

    expect(createKeyProvider).toHaveBeenCalledTimes(2);
  });
});

