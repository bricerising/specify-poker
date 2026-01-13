import { describe, it, expect, vi, beforeEach } from "vitest";
import { httpRateLimitMiddleware } from "../../../src/http/middleware/rateLimit";
import { createMockReq, createMockRes } from "../helpers/express";

vi.mock("../../../src/storage/rateLimitStore", () => ({
  incrementRateLimit: vi.fn(),
}));

vi.mock("../../../src/observability/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

import { incrementRateLimit } from "../../../src/storage/rateLimitStore";

describe("HTTP rate limit middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks requests when IP limit is exceeded", async () => {
    vi.mocked(incrementRateLimit).mockResolvedValue(101);
    const req = createMockReq({ method: "GET", url: "/protected" });
    req.ip = "1.2.3.4";
    const { res, done } = createMockRes();
    const next = vi.fn();

    await httpRateLimitMiddleware(req, res, next);

    const response = await done;
    expect(response.statusCode).toBe(429);
    expect(response.body).toEqual(expect.objectContaining({ error: "Too many requests from this IP" }));
  });

  it("blocks requests when user limit is exceeded", async () => {
    vi.mocked(incrementRateLimit)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(101);
    const req = createMockReq({
      method: "GET",
      url: "/protected",
      auth: { userId: "user-1", token: "t", claims: {} },
    });
    req.ip = "1.2.3.4";
    const { res, done } = createMockRes();
    const next = vi.fn();

    await httpRateLimitMiddleware(req, res, next);

    const response = await done;
    expect(response.statusCode).toBe(429);
    expect(response.body).toEqual(expect.objectContaining({ error: "Too many requests from this user" }));
  });

  it("fails open when rate limit store errors", async () => {
    vi.mocked(incrementRateLimit).mockRejectedValue(new Error("redis down"));
    const req = createMockReq({ method: "GET", url: "/protected" });
    req.ip = "1.2.3.4";
    const { res } = createMockRes();
    const next = vi.fn();

    await httpRateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});
