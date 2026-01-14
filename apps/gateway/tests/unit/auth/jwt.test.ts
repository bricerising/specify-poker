import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

describe("JWT verification", () => {
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

  it("uses configured public key when provided", async () => {
    process.env.JWT_PUBLIC_KEY = "PUBLICKEY";
    jwtMock.decode.mockReturnValue({ header: {} });
    jwtMock.verify.mockReturnValue({ sub: "user-1" });

    const { verifyToken } = await import("../../../src/auth/jwt");
    const result = await verifyToken("token");

    expect(jwtMock.verify).toHaveBeenCalledWith(
      "token",
      expect.stringContaining("BEGIN PUBLIC KEY"),
      expect.objectContaining({ algorithms: ["RS256"] })
    );
    expect(result.sub).toBe("user-1");
  });

  it("uses JWKS certificate when token header has kid", async () => {
    jwtMock.decode.mockReturnValue({ header: { kid: "kid-1" } });
    jwtMock.verify.mockReturnValue({ sub: "user-2" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [{ kid: "kid-1", x5c: ["CERTDATA"] }] }),
    } as Response);

    const { verifyToken } = await import("../../../src/auth/jwt");
    await verifyToken("token");

    expect(jwtMock.verify).toHaveBeenCalledWith(
      "token",
      expect.stringContaining("BEGIN CERTIFICATE"),
      expect.objectContaining({ algorithms: ["RS256"] })
    );
  });

  it("falls back to HS256 secret when no kid or public key", async () => {
    process.env.JWT_HS256_SECRET = "shared-secret";
    jwtMock.decode.mockReturnValue({ header: {} });
    jwtMock.verify.mockReturnValue({ sub: "user-3" });

    const { verifyToken } = await import("../../../src/auth/jwt");
    await verifyToken("token");

    expect(jwtMock.verify).toHaveBeenCalledWith(
      "token",
      "shared-secret",
      expect.objectContaining({ algorithms: ["HS256"] })
    );
  });

  it("fetches Keycloak realm public key when no secret or kid", async () => {
    process.env.JWT_CONFIG_SECRET = "";
    jwtMock.decode.mockReturnValue({ header: {} });
    jwtMock.verify.mockReturnValue({ sub: "user-4" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ public_key: "REALMKEY" }),
    } as Response);

    const { verifyToken } = await import("../../../src/auth/jwt");
    await verifyToken("token");

    expect(jwtMock.verify).toHaveBeenCalledWith(
      "token",
      expect.stringContaining("BEGIN PUBLIC KEY"),
      expect.objectContaining({ algorithms: ["RS256"] })
    );
  });
});
