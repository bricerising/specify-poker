import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSpan, pinoFactory } = vi.hoisted(() => ({
  getSpan: vi.fn(),
  pinoFactory: vi.fn((options: { mixin: () => Record<string, unknown> }) => ({
    _mixin: options.mixin,
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("@opentelemetry/api", () => ({
  context: {
    active: vi.fn(() => ({})),
  },
  trace: {
    getSpan,
  },
}));

vi.mock("pino", () => ({ default: pinoFactory }));

vi.mock("../../config", () => ({
  config: {
    logLevel: "info",
  },
}));

import logger from "../logger";

describe("logger mixin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty mixin when no span", () => {
    getSpan.mockReturnValue(null);

    const mixin = (logger as { _mixin: () => Record<string, unknown> })._mixin();

    expect(mixin).toEqual({});
  });

  it("includes trace fields when span exists", () => {
    getSpan.mockReturnValue({
      spanContext: () => ({ traceId: "trace-1", spanId: "span-1" }),
    });

    const mixin = (logger as { _mixin: () => Record<string, unknown> })._mixin();

    expect(mixin).toEqual({ traceId: "trace-1", spanId: "span-1" });
  });
});
