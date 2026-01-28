import { describe, expect, it, vi } from "vitest";

import { createUnaryCallResultProxy } from "../src/grpc/unaryCallResultProxy";

describe("createUnaryCallResultProxy", () => {
  it("adapts unary callback methods to UnaryCallResults", async () => {
    const client = {
      prefix: "p:",
      Ping(request: string, callback: (err: Error | null, response: string) => void) {
        callback(null, `pong:${this.prefix}${request}`);
      },
    };

    const proxy = createUnaryCallResultProxy(client);
    await expect(proxy.Ping("hello")).resolves.toEqual({ ok: true, value: "pong:p:hello" });
  });

  it("preserves `this` binding", async () => {
    const client = {
      value: 41,
      AddOne(_request: Record<string, never>, callback: (err: Error | null, response: number) => void) {
        callback(null, this.value + 1);
      },
    };

    const proxy = createUnaryCallResultProxy(client);
    await expect(proxy.AddOne({})).resolves.toEqual({ ok: true, value: 42 });
  });

  it("is not thenable", () => {
    const proxy = createUnaryCallResultProxy({
      Ping(_request: Record<string, never>, callback: (err: Error | null, response: string) => void) {
        callback(null, "pong");
      },
    });

    expect((proxy as { then?: unknown }).then).toBeUndefined();
  });

  it("returns an error result when calling a non-function property", async () => {
    const proxy = createUnaryCallResultProxy({ value: 123 });

    const result = await (proxy as { value: (request: unknown) => Promise<unknown> }).value({});
    expect(result).toMatchObject({ ok: false });

    const error = (result as { ok: false; error: unknown }).error;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/unary_call_result_proxy\.non_function_property/);
  });

  it("passes AbortSignal through to unaryCallResult", async () => {
    const client = {
      Ping: vi.fn((_request: Record<string, never>, _callback: (err: Error | null, response: string) => void) => ({
        cancel: vi.fn(),
      })),
    };

    const proxy = createUnaryCallResultProxy(client);
    const controller = new AbortController();
    const promise = proxy.Ping({}, { signal: controller.signal });
    controller.abort();

    await expect(promise).resolves.toMatchObject({
      ok: false,
      error: expect.objectContaining({ name: "AbortError" }),
    });
    expect(client.Ping).toHaveBeenCalledTimes(1);
  });
});
