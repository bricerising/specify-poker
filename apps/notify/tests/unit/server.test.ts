import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/observability', () => ({
  startObservability: vi.fn(),
}));

vi.mock("../../src/app", () => ({
  createNotifyApp: vi.fn(),
}));

import { main } from "../../src/server";
import { createNotifyApp } from "../../src/app";

describe('Server main', () => {
  it('should initialize and start services', async () => {
    const appMock = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      services: {},
    };
    (createNotifyApp as unknown).mockReturnValue(appMock);

    await main();
    expect(appMock.start).toHaveBeenCalled();
  });

  it('should throw error if start fails', async () => {
    const appMock = {
      start: vi.fn().mockRejectedValue(new Error("Start failed")),
      stop: vi.fn().mockResolvedValue(undefined),
      services: {},
    };
    (createNotifyApp as unknown).mockReturnValue(appMock);

    await expect(main()).rejects.toThrow('Start failed');
    expect(appMock.stop).toHaveBeenCalled();
  });
});
