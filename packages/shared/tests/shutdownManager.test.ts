import { describe, expect, it, vi } from "vitest";

import { createShutdownManager } from "../src/lifecycle/shutdown";

describe("createShutdownManager", () => {
  it("runs steps in reverse order", async () => {
    const calls: string[] = [];
    const shutdown = createShutdownManager();

    shutdown.add("a", () => calls.push("a"));
    shutdown.add("b", () => calls.push("b"));
    shutdown.add("c", () => calls.push("c"));

    await shutdown.run();
    expect(calls).toEqual(["c", "b", "a"]);
  });

  it("logs errors and continues", async () => {
    const calls: string[] = [];
    const logger = { error: vi.fn() };
    const shutdown = createShutdownManager({ logger });

    shutdown.add("a", () => calls.push("a"));
    shutdown.add("boom", () => {
      throw new Error("nope");
    });
    shutdown.add("c", () => calls.push("c"));

    await shutdown.run();
    expect(calls).toEqual(["c", "a"]);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("is idempotent", async () => {
    const calls: string[] = [];
    const shutdown = createShutdownManager();

    shutdown.add("a", () => calls.push("a"));

    await shutdown.run();
    await shutdown.run();
    expect(calls).toEqual(["a"]);
  });
});

