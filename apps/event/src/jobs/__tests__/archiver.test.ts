import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Archiver } from "../archiver";

const ONE_HOUR_MS = 3600 * 1000;

describe("Archiver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts and schedules runs", async () => {
    const archiver = new Archiver();

    await archiver.start();

    expect(console.log).toHaveBeenCalledWith("Archiver started");

    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS);

    expect(console.log).toHaveBeenCalledWith(
      "Archiver: Checking for events older than retention period..."
    );
  });

  it("does not run after stop", async () => {
    const archiver = new Archiver();

    await archiver.start();
    archiver.stop();
    vi.mocked(console.log).mockClear();

    await archiver.run();

    expect(console.log).not.toHaveBeenCalled();
  });
});
