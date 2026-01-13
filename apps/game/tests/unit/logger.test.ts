import { describe, expect, it, vi } from "vitest";

vi.mock("@opentelemetry/api", () => ({
  context: { active: () => ({}) },
  trace: {
    getSpan: () => ({
      spanContext: () => ({ traceId: "trace-1", spanId: "span-1" }),
    }),
  },
}));

vi.mock("pino", () => ({
  default: (options: { level: string; mixin: () => Record<string, string> }) => ({
    level: options.level,
    mixinResult: options.mixin(),
    info: vi.fn(),
  }),
}));

describe("logger", () => {
  it("adds trace context to log mixins when a span is active", async () => {
    const loggerModule = await import("../../src/observability/logger");
    const logger = loggerModule.default as { level: string; mixinResult: Record<string, string> };

    expect(logger.level).toBe("info");
    expect(logger.mixinResult).toEqual({ traceId: "trace-1", spanId: "span-1" });
  });
});
