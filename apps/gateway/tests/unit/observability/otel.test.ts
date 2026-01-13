import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sdkInstance = {
  start: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: vi.fn(() => sdkInstance),
}));

vi.mock("@opentelemetry/resources", () => ({
  Resource: vi.fn(),
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  SemanticResourceAttributes: { SERVICE_NAME: "service.name" },
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({
  OTLPMetricExporter: vi.fn(),
}));

vi.mock("@opentelemetry/sdk-metrics", () => ({
  PeriodicExportingMetricReader: vi.fn(),
}));

vi.mock("@opentelemetry/instrumentation-http", () => ({
  HttpInstrumentation: vi.fn(),
}));

vi.mock("@opentelemetry/instrumentation-express", () => ({
  ExpressInstrumentation: vi.fn(),
}));

vi.mock("../../../src/observability/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("OTEL init", () => {
  const originalExit = process.exit;
  const originalOn = process.on;
  const handlers: Record<string, () => void> = {};
  let exitSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    sdkInstance.start.mockReset();
    sdkInstance.shutdown.mockReset().mockResolvedValue(undefined);
    handlers.SIGTERM = undefined as unknown as () => void;
    process.on = vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
      return process;
    }) as unknown as typeof process.on;
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    process.exit = originalExit;
    process.on = originalOn;
  });

  it("starts SDK and registers SIGTERM handler", async () => {
    const { initOTEL } = await import("../../../src/observability/otel");
    initOTEL();

    expect(sdkInstance.start).toHaveBeenCalled();
    expect(handlers.SIGTERM).toBeDefined();

    handlers.SIGTERM();
    await new Promise((resolve) => setImmediate(resolve));
    expect(sdkInstance.shutdown).toHaveBeenCalled();
  });

  it("logs errors when SDK fails to start", async () => {
    sdkInstance.start.mockImplementation(() => {
      throw new Error("failed");
    });
    const logger = (await import("../../../src/observability/logger")).default;
    const { initOTEL } = await import("../../../src/observability/otel");
    initOTEL();

    expect(logger.error).toHaveBeenCalled();
  });
});
