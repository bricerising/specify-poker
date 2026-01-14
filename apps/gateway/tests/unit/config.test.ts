import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/config";

describe("Config Loader", () => {
  it("should load default values", () => {
    const config = loadConfig();
    expect(config.port).toBe(4000);
    expect(config.redisUrl).toBe("redis://localhost:6379");
  });

  it("should load values from environment", () => {
    process.env.PORT = "5000";
    process.env.REDIS_URL = "redis://other:6379";
    const config = loadConfig();
    expect(config.port).toBe(5000);
    expect(config.redisUrl).toBe("redis://other:6379");
  });
});
