import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { context, trace, ROOT_CONTEXT } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { EventEmitter } from "events";

describe("WebSocket OTEL context isolation", () => {
  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  });

  afterAll(() => {
    context.disable();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("runs ws handleUpgrade under ROOT_CONTEXT", async () => {
    let spanDuringHandleUpgrade: unknown;

    vi.doMock("ws", () => {
      class WebSocketServer {
        handleUpgrade(_request: unknown, _socket: unknown, _head: unknown, callback: (ws: unknown) => void) {
          spanDuringHandleUpgrade = trace.getSpan(context.active());
          callback({});
        }

        on() {
          return this;
        }

        emit() {
          return false;
        }
      }

      class WebSocket {}

      return { default: WebSocket, WebSocketServer };
    });

    vi.doMock("../../src/ws/pubsub", () => ({
      initWsPubSub: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("../../src/ws/handlers/table", () => ({
      attachTableHub: vi.fn(),
      handleTablePubSubEvent: vi.fn(),
    }));

    vi.doMock("../../src/ws/handlers/lobby", () => ({
      attachLobbyHub: vi.fn(),
      handleLobbyPubSubEvent: vi.fn(),
    }));

    vi.doMock("../../src/ws/handlers/chat", () => ({
      attachChatHub: vi.fn(),
      handleChatPubSubEvent: vi.fn(),
    }));

    vi.doMock("../../src/grpc/clients", () => ({
      eventClient: {
        PublishEvent: vi.fn(),
      },
    }));

    vi.doMock("../../src/storage/sessionStore", () => ({
      updatePresence: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("../../src/storage/connectionStore", () => ({
      getConnectionsByUser: vi.fn().mockResolvedValue([]),
    }));

    vi.doMock("../../src/ws/connectionRegistry", () => ({
      registerConnection: vi.fn().mockResolvedValue(undefined),
      unregisterConnection: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("../../src/ws/heartbeat", () => ({
      setupHeartbeat: vi.fn(),
    }));

    vi.doMock("../../src/ws/auth", () => ({
      authenticateWs: vi.fn().mockResolvedValue({ status: "missing" }),
      authenticateWsToken: vi.fn(),
    }));

    vi.doMock("../../src/observability/logger", () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { initWsServer } = await import("../../src/ws/server");

    const server = new EventEmitter();
    await initWsServer(server as unknown as import("http").Server);

    const upgradeHandler = server.listeners("upgrade")[0] as unknown as (
      request: unknown,
      socket: unknown,
      head: unknown,
    ) => Promise<void>;

    const parentSpan = {
      spanContext: () => ({
        traceId: "11111111111111111111111111111111",
        spanId: "2222222222222222",
        traceFlags: 1,
      }),
    };

    await context.with(trace.setSpan(ROOT_CONTEXT, parentSpan as unknown as import("@opentelemetry/api").Span), async () => {
      await upgradeHandler(
        {
          url: "/ws",
          headers: { host: "localhost" },
          socket: { remoteAddress: "127.0.0.1" },
        },
        {},
        Buffer.alloc(0),
      );
    });

    expect(spanDuringHandleUpgrade).toBeUndefined();
  });
});

