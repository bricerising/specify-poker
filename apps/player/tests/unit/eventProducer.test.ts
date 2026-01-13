import { describe, it, expect, beforeEach, vi } from "vitest";
import { publishEvent } from "../../src/services/eventProducer";
import * as redisClient from "../../src/storage/redisClient";
import logger from "../../src/observability/logger";

vi.mock("../../src/storage/redisClient");
vi.mock("../../src/observability/logger", () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("eventProducer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns when redis is unavailable", async () => {
    vi.mocked(redisClient.getRedisClient).mockResolvedValue(null);

    await publishEvent("DAILY_LOGIN", { userId: "user-1" }, "user-1");

    expect(logger.warn).toHaveBeenCalledWith({ type: "DAILY_LOGIN" }, "Redis not available, cannot publish event");
  });

  it("publishes events to the redis stream", async () => {
    const xAdd = vi.fn();
    vi.mocked(redisClient.getRedisClient).mockResolvedValue({ xAdd } as never);

    await publishEvent("REFERRAL_REWARD", { referrerId: "u1" }, "u1");

    expect(xAdd).toHaveBeenCalledWith("events:all", "*", expect.any(Object));
  });
});
