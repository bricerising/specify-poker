import { describe, it, expect, beforeEach, vi } from "vitest";
import * as metrics from "../../src/observability/metrics";

const listen = vi.fn((_port: number, cb?: () => void) => {
  if (cb) cb();
});

let handler: ((req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (body?: string) => void }) => void) | null =
  null;

vi.mock("http", () => ({
  createServer: (cb: typeof handler) => {
    handler = cb;
    return { listen };
  },
  default: {
    createServer: (cb: typeof handler) => {
      handler = cb;
      return { listen };
    },
  },
}));

vi.mock("../../src/observability/logger", () => ({
  default: {
    info: vi.fn(),
  },
}));

describe("metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders metrics after recording counters", async () => {
    metrics.recordProfileLookup("ok");
    metrics.recordProfileUpdate("ok");
    metrics.recordFriendMutation("add", "ok");
    metrics.recordStatisticsUpdate("hands_played");
    metrics.recordGrpcRequest("GetProfile", "ok", 10);

    const output = await metrics.renderMetrics();

    expect(output).toContain("player_profile_lookups_total");
    expect(output).toContain("player_grpc_request_duration_seconds");
  });

  it("serves /metrics responses", async () => {
    metrics.startMetricsServer(9106);

    if (!handler) {
      throw new Error("Expected metrics handler to be registered");
    }

    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };

    await handler({ url: "/metrics" }, res);

    expect(res.statusCode).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", expect.any(String));
  });

  it("returns 404 for unknown paths", async () => {
    metrics.startMetricsServer(9106);

    if (!handler) {
      throw new Error("Expected metrics handler to be registered");
    }

    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };

    await handler({ url: "/nope" }, res);

    expect(res.statusCode).toBe(404);
    expect(res.end).toHaveBeenCalledWith("Not Found");
  });
});
