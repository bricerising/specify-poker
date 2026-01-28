import { describe, expect, it, vi } from "vitest";

import { runServiceMain } from "../src/lifecycle/serviceRunner";

type Listener = (...args: unknown[]) => void;

class FakeProcess {
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  emit(event: string, ...args: unknown[]): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) {
      listener(...args);
    }
  }
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("runServiceMain", () => {
  it("runs main and does not exit on success", async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {});
    const shutdown = vi.fn(async () => {});
    const exit = vi.fn();

    runServiceMain({ main, shutdown, exit, process: proc });

    await nextTick();

    expect(main).toHaveBeenCalledTimes(1);
    expect(shutdown).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("shuts down and exits on main error", async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {
      throw new Error("boom");
    });
    const shutdown = vi.fn(async () => {});
    const exit = vi.fn();

    runServiceMain({ main, shutdown, exit, process: proc, fatalExitCode: 9 });

    await nextTick();
    await nextTick();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(9);
  });

  it("is idempotent across multiple exit signals", async () => {
    const proc = new FakeProcess();
    const main = vi.fn(async () => {
      await new Promise(() => {});
    });
    const shutdown = vi.fn(async () => {});
    const exit = vi.fn();

    runServiceMain({ main, shutdown, exit, process: proc });

    proc.emit("SIGINT");
    proc.emit("SIGTERM");

    await nextTick();
    await nextTick();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});

