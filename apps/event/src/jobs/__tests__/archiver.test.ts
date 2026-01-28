import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Archiver } from '../archiver';

const ONE_HOUR_MS = 3600 * 1000;

const { loggerInfo } = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
}));

vi.mock('../../observability/logger', () => ({
  default: {
    info: loggerInfo,
  },
}));

describe('Archiver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts and schedules runs', async () => {
    const archiver = new Archiver();

    await archiver.start();

    expect(loggerInfo).toHaveBeenCalledWith('Archiver started');

    await vi.advanceTimersByTimeAsync(ONE_HOUR_MS);

    expect(loggerInfo).toHaveBeenCalledWith(
      'Archiver: Checking for events older than retention period...',
    );
  });

  it('does not run after stop', async () => {
    const archiver = new Archiver();

    await archiver.start();
    archiver.stop();
    vi.mocked(loggerInfo).mockClear();

    await archiver.run();

    expect(loggerInfo).not.toHaveBeenCalled();
  });
});
