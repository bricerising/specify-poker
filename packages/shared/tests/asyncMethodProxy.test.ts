import { describe, expect, it, vi } from "vitest";

import { createAsyncMethodProxy } from "../src/redis/asyncMethodProxy";

describe("createAsyncMethodProxy", () => {
  it("delegates method calls to the resolved target", async () => {
    const target = {
      ping: vi.fn(async (value: string) => `pong:${value}`),
    };
    const getTarget = vi.fn(async () => target);

    const proxy = createAsyncMethodProxy(getTarget);

    const result = await (proxy as { ping: (value: string) => Promise<string> }).ping("hello");
    expect(result).toBe("pong:hello");
    expect(getTarget).toHaveBeenCalledTimes(1);
    expect(target.ping).toHaveBeenCalledWith("hello");
  });

  it("is not thenable", () => {
    const proxy = createAsyncMethodProxy(async () => ({
      ping: async () => "pong",
    }));

    expect((proxy as { then?: unknown }).then).toBeUndefined();
  });

  it("throws when calling a non-function property", async () => {
    const proxy = createAsyncMethodProxy(async () => ({ value: 123 }));

    await expect(async () => {
      await (proxy as { value: (...args: unknown[]) => Promise<unknown> }).value();
    }).rejects.toThrow(/async_method_proxy\.non_function_property/);
  });
});

