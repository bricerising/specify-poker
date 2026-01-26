import { describe, it, expect, vi, beforeEach } from "vitest";
import { authMiddleware } from "../../../src/http/middleware/auth";
import { createMockReq, createMockRes } from "../helpers/express";

vi.mock("../../../src/auth/jwt", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("../../../src/observability/logger", () => ({
  default: {
    warn: vi.fn(),
  },
}));

import { verifyToken } from "../../../src/auth/jwt";

describe("Auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without bearer token", async () => {
    const req = createMockReq({ method: "GET", url: "/protected" });
    const { res, done } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    const response = await done;
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual(expect.objectContaining({ code: "auth_denied" }));
  });

  it("rejects invalid tokens", async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error("bad token"));
    const req = createMockReq({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer bad" },
    });
    const { res, done } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    const response = await done;
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual(expect.objectContaining({ message: "Invalid token" }));
  });

  it("rejects tokens without subject", async () => {
    vi.mocked(verifyToken).mockResolvedValue({});
    const req = createMockReq({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer no-sub" },
    });
    const { res, done } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    const response = await done;
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual(expect.objectContaining({ message: "Missing subject" }));
  });

  it("attaches auth context for valid tokens", async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: "user-1", role: "player" });
    const req = createMockReq({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer good" },
    });
    const { res } = createMockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth?.userId).toBe("user-1");
  });
});
