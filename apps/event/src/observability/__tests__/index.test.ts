import { describe, expect, it, vi } from "vitest";

const { start, shutdown, loggerInfo } = vi.hoisted(() => ({
  start: vi.fn(),
  shutdown: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: vi.fn(() => ({ start, shutdown })),
}));

vi.mock("@opentelemetry/auto-instrumentations-node", () => ({
  getNodeAutoInstrumentations: vi.fn(() => []),
}));

vi.mock("@opentelemetry/exporter-trace-otlp-grpc", () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/resources", () => ({
  Resource: class {},
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  SemanticResourceAttributes: { SERVICE_NAME: "service.name" },
}));

vi.mock("../logger", () => ({
  default: {
    info: loggerInfo,
  },
}));

vi.mock("../../config", () => ({
  config: {
    otelExporterEndpoint: "http://localhost:4317",
  },
}));

import { startObservability, stopObservability } from "../index";

describe("observability", () => {
  it("starts and logs", async () => {
    await startObservability();

    expect(start).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith("OpenTelemetry SDK started");
  });

  it("stops and logs", async () => {
    await stopObservability();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(loggerInfo).toHaveBeenCalledWith("OpenTelemetry SDK shut down");
  });
});
