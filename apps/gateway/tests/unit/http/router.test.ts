import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatchToRouter } from "../helpers/express";

vi.mock("prom-client", () => ({
  register: {
    contentType: "text/plain",
    metrics: vi.fn().mockResolvedValue("metrics"),
  },
}));

vi.mock("../../../src/http/middleware/auth", () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../../src/http/middleware/rateLimit", () => ({
  httpRateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const setupProxy = vi.fn();
vi.mock("../../../src/http/proxy", () => ({
  setupProxy: (...args: unknown[]) => setupProxy(...args),
}));

const getRedisClient = vi.fn();
vi.mock("../../../src/storage/redisClient", () => ({
  getRedisClient: () => getRedisClient(),
}));

describe("HTTP router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("serves health check without auth", async () => {
    const { createRouter } = await import("../../../src/http/router");
    const router = createRouter();
    const response = await dispatchToRouter(router, {
      method: "GET",
      url: "/health",
    });

    expect(setupProxy).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "gateway" });
  });

  it("returns degraded readiness when redis unavailable", async () => {
    getRedisClient.mockResolvedValue(null);
    const { createRouter } = await import("../../../src/http/router");
    const router = createRouter();
    const response = await dispatchToRouter(router, {
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ status: "degraded", reason: "redis_unavailable" });
  });

  it("returns degraded readiness when redis ping fails", async () => {
    getRedisClient.mockResolvedValue({ ping: vi.fn().mockRejectedValue(new Error("down")) });
    const { createRouter } = await import("../../../src/http/router");
    const router = createRouter();
    const response = await dispatchToRouter(router, {
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ status: "degraded", reason: "redis_unreachable" });
  });

  it("returns ready when redis ping succeeds", async () => {
    getRedisClient.mockResolvedValue({ ping: vi.fn().mockResolvedValue("PONG") });
    const { createRouter } = await import("../../../src/http/router");
    const router = createRouter();
    const response = await dispatchToRouter(router, {
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: "ready" });
  });

  it("exposes metrics payload", async () => {
    const { createRouter } = await import("../../../src/http/router");
    const router = createRouter();
    const response = await dispatchToRouter(router, {
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/plain");
    expect(response.body).toBe("metrics");
  });
});
