import { describe, expect, it, vi } from "vitest";

import { resolveJwtVerificationMaterial } from "../src/auth/jwtVerification";

describe("resolveJwtVerificationMaterial", () => {
  it("uses HS256 secret when no kid/public key", async () => {
    const keyProvider = {
      getRealmPublicKeyPem: vi.fn(async () => "REALM"),
      getJwksCertificatePem: vi.fn(async (_kid: string) => "CERT"),
    };

    await expect(
      resolveJwtVerificationMaterial({
        keyProvider,
        hs256Secret: "secret",
      }),
    ).resolves.toEqual({ key: "secret", algorithms: ["HS256"] });
    expect(keyProvider.getRealmPublicKeyPem).not.toHaveBeenCalled();
    expect(keyProvider.getJwksCertificatePem).not.toHaveBeenCalled();
  });

  it("uses explicit public key when provided", async () => {
    const keyProvider = {
      getRealmPublicKeyPem: vi.fn(async () => "REALM"),
      getJwksCertificatePem: vi.fn(async (_kid: string) => "CERT"),
    };

    await expect(
      resolveJwtVerificationMaterial({
        keyProvider,
        hs256Secret: "secret",
        publicKeyPem: "PUBLIC_PEM",
      }),
    ).resolves.toEqual({ key: "PUBLIC_PEM", algorithms: ["RS256"] });
    expect(keyProvider.getRealmPublicKeyPem).not.toHaveBeenCalled();
    expect(keyProvider.getJwksCertificatePem).not.toHaveBeenCalled();
  });

  it("uses JWKS certificate when kid is present (even if secret exists)", async () => {
    const keyProvider = {
      getRealmPublicKeyPem: vi.fn(async () => "REALM"),
      getJwksCertificatePem: vi.fn(async (kid: string) => `CERT:${kid}`),
    };

    await expect(
      resolveJwtVerificationMaterial({
        keyProvider,
        kid: "kid-1",
        hs256Secret: "secret",
      }),
    ).resolves.toEqual({ key: "CERT:kid-1", algorithms: ["RS256"] });
    expect(keyProvider.getJwksCertificatePem).toHaveBeenCalledWith("kid-1");
    expect(keyProvider.getRealmPublicKeyPem).not.toHaveBeenCalled();
  });

  it("falls back to realm public key when no secret/public key/kid", async () => {
    const keyProvider = {
      getRealmPublicKeyPem: vi.fn(async () => "REALM_PEM"),
      getJwksCertificatePem: vi.fn(async (_kid: string) => "CERT"),
    };

    await expect(
      resolveJwtVerificationMaterial({
        keyProvider,
      }),
    ).resolves.toEqual({ key: "REALM_PEM", algorithms: ["RS256"] });
    expect(keyProvider.getRealmPublicKeyPem).toHaveBeenCalledTimes(1);
    expect(keyProvider.getJwksCertificatePem).not.toHaveBeenCalled();
  });
});

