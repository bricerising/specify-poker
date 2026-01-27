import { describe, expect, it, vi } from "vitest";

const loadConfig = async () => {
  vi.resetModules();
  return await import("../../src/config");
};

describe("config", () => {
  it("uses defaults when env is not set", async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv };
    delete process.env.GRPC_PORT;
    delete process.env.PORT;
    delete process.env.REDIS_URL;

    const { getConfig } = await loadConfig();
    const config = getConfig();

    expect(config.port).toBe(50053);
    expect(config.redisUrl).toBe("redis://localhost:6379");

    process.env = originalEnv;
  });

  it("reads overrides from environment variables", async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      GRPC_PORT: "7000",
      REDIS_URL: "redis://example:6379",
      BALANCE_SERVICE_URL: "balance:50051",
      EVENT_SERVICE_URL: "event:50054",
    };

    const { getConfig } = await loadConfig();
    const config = getConfig();

    expect(config.port).toBe(7000);
    expect(config.redisUrl).toBe("redis://example:6379");
    expect(config.balanceServiceAddr).toBe("balance:50051");
    expect(config.eventServiceAddr).toBe("event:50054");

    process.env = originalEnv;
  });

  it("falls back to defaults when numeric env vars are invalid", async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      GRPC_PORT: "not-a-number",
      METRICS_PORT: "",
      TURN_TIMEOUT: "NaN",
    };

    const { getConfig } = await loadConfig();
    const config = getConfig();

    expect(config.port).toBe(50053);
    expect(config.metricsPort).toBe(9105);
    expect(config.turnTimeout).toBe(20000);

    process.env = originalEnv;
  });
});
