import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  runMigrations,
  connectRedis,
  startGrpcServer,
  startMetricsServer,
  handMaterializerStart,
  archiverStart,
  loggerInfo,
  loggerError,
  startObservability,
} = vi.hoisted(() => ({
  runMigrations: vi.fn(),
  connectRedis: vi.fn(),
  startGrpcServer: vi.fn(),
  startMetricsServer: vi.fn(),
  handMaterializerStart: vi.fn(),
  archiverStart: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  startObservability: vi.fn(),
}));

vi.mock("../observability", () => ({
  startObservability,
  stopObservability: vi.fn(),
}));

vi.mock("../storage/migrations", () => ({
  runMigrations,
}));

vi.mock("../storage/redisClient", () => ({
  connectRedis,
}));

vi.mock("../jobs/handMaterializer", () => ({
  handMaterializer: {
    start: handMaterializerStart,
  },
}));

vi.mock("../jobs/archiver", () => ({
  archiver: {
    start: archiverStart,
  },
}));

vi.mock("../api/grpc/server", () => ({
  startGrpcServer,
}));

vi.mock("../observability/metrics", () => ({
  startMetricsServer,
}));

vi.mock("../observability/logger", () => ({
  default: {
    info: loggerInfo,
    error: loggerError,
  },
}));

vi.mock("../config", () => ({
  config: {
    grpcPort: 50054,
    metricsPort: 9090,
  },
}));

describe("event server main", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("starts dependencies in non-test mode", async () => {
    await vi.resetModules();
    const { main } = await import("../server");

    process.env.NODE_ENV = "production";
    startGrpcServer.mockResolvedValue(undefined);

    await main();

    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(connectRedis).toHaveBeenCalledTimes(1);
    expect(handMaterializerStart).toHaveBeenCalledTimes(1);
    expect(archiverStart).toHaveBeenCalledTimes(1);
    expect(startMetricsServer).toHaveBeenCalledWith(9090);
    expect(startGrpcServer).toHaveBeenCalledWith(50054);
    expect(loggerInfo).toHaveBeenCalledWith({ port: 50054 }, "Event Service is running");
  });

  it("skips migrations and jobs in test mode", async () => {
    await vi.resetModules();
    const { main } = await import("../server");

    process.env.NODE_ENV = "test";
    startGrpcServer.mockResolvedValue(undefined);

    await main();

    expect(runMigrations).not.toHaveBeenCalled();
    expect(handMaterializerStart).not.toHaveBeenCalled();
    expect(archiverStart).not.toHaveBeenCalled();
    expect(startMetricsServer).not.toHaveBeenCalled();
    expect(connectRedis).toHaveBeenCalledTimes(1);
    expect(startGrpcServer).toHaveBeenCalledWith(50054);
  });

  it("logs and rethrows errors in test mode", async () => {
    await vi.resetModules();
    const { main } = await import("../server");

    process.env.NODE_ENV = "test";
    startGrpcServer.mockRejectedValue(new Error("boom"));

    await expect(main()).rejects.toThrow("boom");
    expect(loggerError).toHaveBeenCalledWith({ error: expect.any(Error) }, "Failed to start Event Service");
  });
});
