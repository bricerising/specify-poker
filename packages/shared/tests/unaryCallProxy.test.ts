import { describe, expect, it, vi } from "vitest";

import { createUnaryCallProxy } from "../src/grpc/unaryCallProxy";

describe("createUnaryCallProxy", () => {
  it("adapts unary callback methods to Promises", async () => {
    const client = {
      prefix: "p:",
      Ping(request: string, callback: (err: Error | null, response: string) => void) {
        callback(null, `pong:${this.prefix}${request}`);
      },
    };

    const proxy = createUnaryCallProxy(client);
    await expect(proxy.Ping("hello")).resolves.toBe("pong:p:hello");
  });

  it("preserves `this` binding", async () => {
    const client = {
      value: 41,
      AddOne(_request: Record<string, never>, callback: (err: Error | null, response: number) => void) {
        callback(null, this.value + 1);
      },
    };

    const proxy = createUnaryCallProxy(client);
    await expect(proxy.AddOne({})).resolves.toBe(42);
  });

  it("is not thenable", () => {
    const proxy = createUnaryCallProxy({
      Ping(_request: Record<string, never>, callback: (err: Error | null, response: string) => void) {
        callback(null, "pong");
      },
    });

    expect((proxy as { then?: unknown }).then).toBeUndefined();
  });

  it("rejects when calling a non-function property", async () => {
    const proxy = createUnaryCallProxy({ value: 123 });

    await expect((proxy as { value: (request: unknown) => Promise<unknown> }).value({})).rejects.toThrow(
      /unary_call_proxy\.non_function_property/,
    );
  });

  it("passes AbortSignal through to unaryCall", async () => {
    const client = {
      Ping: vi.fn((_request: Record<string, never>, _callback: (err: Error | null, response: string) => void) => ({
        cancel: vi.fn(),
      })),
    };

    const proxy = createUnaryCallProxy(client);
    const controller = new AbortController();
    const promise = proxy.Ping({}, { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(client.Ping).toHaveBeenCalledTimes(1);
  });
});

