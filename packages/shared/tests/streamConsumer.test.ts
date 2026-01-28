import { describe, expect, it, vi } from "vitest";

import { runRedisStreamConsumer, type RedisStreamConsumerClient } from "../src/redis/streamConsumer";

describe("runRedisStreamConsumer", () => {
  it("calls onMessage and acks messages", async () => {
    const controller = new AbortController();

    const client: RedisStreamConsumerClient = {
      xGroupCreate: vi.fn(async () => undefined),
      xReadGroup: vi.fn(async () => [{ messages: [{ id: "1-0", message: { data: "hello" } }] }]),
      xAck: vi.fn(async () => {
        controller.abort();
      }),
    };

    const onMessage = vi.fn(async () => undefined);

    await runRedisStreamConsumer(controller.signal, {
      streamKey: "events:all",
      groupName: "group",
      consumerName: "consumer",
      getClient: async () => client,
      onMessage,
      blockMs: 0,
      readCount: 1,
      sleep: async () => undefined,
    });

    expect(client.xGroupCreate).toHaveBeenCalledWith("events:all", "group", "0", { MKSTREAM: true });
    expect(onMessage).toHaveBeenCalledWith({ id: "1-0", fields: { data: "hello" } });
    expect(client.xAck).toHaveBeenCalledWith("events:all", "group", "1-0");
  });

  it("acks even when the message handler throws", async () => {
    const controller = new AbortController();

    const client: RedisStreamConsumerClient = {
      xGroupCreate: vi.fn(async () => undefined),
      xReadGroup: vi.fn(async () => [{ messages: [{ id: "1-0", message: { data: "boom" } }] }]),
      xAck: vi.fn(async () => {
        controller.abort();
      }),
    };

    const onMessage = vi.fn(() => {
      throw new Error("handler_failed");
    });

    await runRedisStreamConsumer(controller.signal, {
      streamKey: "events:all",
      groupName: "group",
      consumerName: "consumer",
      getClient: async () => client,
      onMessage,
      blockMs: 0,
      readCount: 1,
      sleep: async () => undefined,
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(client.xAck).toHaveBeenCalledTimes(1);
  });

  it("ignores BUSYGROUP errors for consumer group creation", async () => {
    const controller = new AbortController();

    const client: RedisStreamConsumerClient = {
      xGroupCreate: vi.fn(async () => {
        throw new Error("BUSYGROUP Consumer Group name already exists");
      }),
      xReadGroup: vi.fn(async () => [{ messages: [{ id: "1-0", message: { data: "ok" } }] }]),
      xAck: vi.fn(async () => {
        controller.abort();
      }),
    };

    await runRedisStreamConsumer(controller.signal, {
      streamKey: "events:all",
      groupName: "group",
      consumerName: "consumer",
      getClient: async () => client,
      onMessage: async () => undefined,
      blockMs: 0,
      readCount: 1,
      sleep: async () => undefined,
    });

    expect(client.xReadGroup).toHaveBeenCalled();
  });
});

