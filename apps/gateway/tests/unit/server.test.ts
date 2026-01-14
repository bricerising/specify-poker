import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const app = { use: vi.fn() };
const server = {
  listen: vi.fn((_port: number, cb: () => void) => cb()),
  close: vi.fn((cb: () => void) => cb()),
};

vi.mock("express", () => ({
  default: vi.fn(() => app),
}));

vi.mock("cors", () => ({
  default: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("http", () => ({
  createServer: vi.fn(() => server),
}));

vi.mock("../../src/config", () => ({
  getConfig: () => ({ port: 4000, corsOrigin: "*" }),
}));

vi.mock("../../src/http/router", () => ({
  createRouter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../src/ws/server", () => ({
  initWsServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/observability/otel", () => ({
  initOTEL: vi.fn(),
  shutdownOTEL: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/storage/instanceRegistry", () => ({
  registerInstance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("prom-client", () => ({
  collectDefaultMetrics: vi.fn(),
}));

vi.mock("../../src/observability/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Gateway server startup", () => {
  const originalExit = process.exit;
  const originalOn = process.on;
  const handlers: Record<string, () => void> = {};

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.exit = vi.fn() as unknown as typeof process.exit;
    process.on = vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
      return process;
    }) as unknown as typeof process.on;
  });

  afterEach(() => {
    process.exit = originalExit;
    process.on = originalOn;
  });

  it("boots services and listens for shutdown", async () => {
    const logger = (await import("../../src/observability/logger")).default;
    await import("../../src/server");

    expect(server.listen).toHaveBeenCalledWith(4000, expect.any(Function));
    expect(logger.info).toHaveBeenCalledWith({ port: 4000 }, "Gateway service started");
    expect(handlers.SIGTERM).toBeDefined();
    expect(handlers.SIGINT).toBeDefined();

    handlers.SIGTERM();
    expect(server.close).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
