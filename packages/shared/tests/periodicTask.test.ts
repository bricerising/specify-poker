import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPeriodicTask } from "../src/lifecycle/periodicTask";

describe("createPeriodicTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs on the interval when runOnStart is false", async () => {
    const run = vi.fn();
    const task = createPeriodicTask({ name: "test", intervalMs: 1000, run });

    task.start();

    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    task.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("runs immediately when runOnStart is true", async () => {
    const run = vi.fn();
    const task = createPeriodicTask({ name: "test", intervalMs: 1000, run, runOnStart: true });

    task.start();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("start is idempotent", async () => {
    const run = vi.fn();
    const task = createPeriodicTask({ name: "test", intervalMs: 1000, run });

    task.start();
    task.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

