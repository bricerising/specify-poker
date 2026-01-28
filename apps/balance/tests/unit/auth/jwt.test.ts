import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jwtMock = {
  decode: vi.fn(),
  verify: vi.fn(),
};

vi.mock("jsonwebtoken", () => ({
  default: jwtMock,
}));

vi.mock("../../../src/config", () => ({
  getConfig: () => ({ jwtSecret: process.env.JWT_CONFIG_SECRET ?? "config-secret" }),
}));

const originalFetch = global.fetch;

function base64UrlEncode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createTestJwt(header: Record<string, unknown>): string {
  const headerSegment = base64UrlEncode({ typ: "JWT", alg: "RS256", ...header });
  const payloadSegment = base64UrlEncode({});
  return `${headerSegment}.${payloadSegment}.sig`;
}

describe("Balance JWT verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.JWT_PUBLIC_KEY;
    delete process.env.JWT_HS256_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.KEYCLOAK_URL;
    delete process.env.KEYCLOAK_REALM;
    delete process.env.JWT_CONFIG_SECRET;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uses JWKS certificate when token header has kid (even if HS256 secret is set)", async () => {
    process.env.JWT_HS256_SECRET = "shared-secret";
    jwtMock.verify.mockReturnValue({ sub: "user-1" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [{ kid: "kid-1", x5c: ["CERTDATA"] }] }),
    } as Response);

    const { verifyToken } = await import("../../../src/auth/jwt");
    const token = createTestJwt({ kid: "kid-1" });
    await verifyToken(token);

    expect(jwtMock.verify).toHaveBeenCalledWith(
      token,
      expect.stringContaining("BEGIN CERTIFICATE"),
      expect.objectContaining({ algorithms: ["RS256"] })
    );
  });

  it("falls back to HS256 secret when no kid or public key", async () => {
    process.env.JWT_HS256_SECRET = "shared-secret";
    jwtMock.verify.mockReturnValue({ sub: "user-2" });

    const { verifyToken } = await import("../../../src/auth/jwt");
    const token = createTestJwt({});
    await verifyToken(token);

    expect(jwtMock.verify).toHaveBeenCalledWith(
      token,
      "shared-secret",
      expect.objectContaining({ algorithms: ["HS256"] })
    );
  });

  it("fetches Keycloak realm public key when no secret, kid, or public key", async () => {
    process.env.JWT_CONFIG_SECRET = "";
    jwtMock.verify.mockReturnValue({ sub: "user-3" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ public_key: "REALMKEY" }),
    } as Response);

    const { verifyToken } = await import("../../../src/auth/jwt");
    const token = createTestJwt({});
    await verifyToken(token);

    expect(jwtMock.verify).toHaveBeenCalledWith(
      token,
      expect.stringContaining("BEGIN PUBLIC KEY"),
      expect.objectContaining({ algorithms: ["RS256"] })
    );
  });
});
