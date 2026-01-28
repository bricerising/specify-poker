import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/storage/db', () => ({
  query: vi.fn(),
}));

vi.mock('../../src/services/deletionService', () => ({
  hardDelete: vi.fn(),
}));

vi.mock('../../src/config', () => ({
  getConfig: () => ({
    deletionProcessorIntervalMs: 1000,
  }),
}));

vi.mock('../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('deletion processor lifecycle', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const db = await import('../../src/storage/db');
    vi.mocked(db.query).mockResolvedValue({ rows: [] } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and schedules periodic deletion checks', async () => {
    const job = await import('../../src/jobs/deletionProcessor');

    job.startDeletionProcessor();
    await vi.runOnlyPendingTimersAsync();

    const db = await import('../../src/storage/db');
    expect(db.query).toHaveBeenCalled();

    job.stopDeletionProcessor();
  });

  it('stops the interval when requested', async () => {
    const job = await import('../../src/jobs/deletionProcessor');
    const logger = await import('../../src/observability/logger');

    job.startDeletionProcessor();
    job.stopDeletionProcessor();

    expect(logger.default.info).toHaveBeenCalledWith('Stopped deletion processor job');
  });

  it('logs errors when hard deletion fails', async () => {
    const db = await import('../../src/storage/db');
    vi.mocked(db.query).mockResolvedValue({
      rows: [{ user_id: 'user-1', deleted_at: new Date('2024-01-01T00:00:00Z') }],
    } as never);
    const deletionService = await import('../../src/services/deletionService');
    vi.mocked(deletionService.hardDelete).mockRejectedValue(new Error('boom'));
    const logger = await import('../../src/observability/logger');
    const job = await import('../../src/jobs/deletionProcessor');

    job.startDeletionProcessor();
    await vi.runOnlyPendingTimersAsync();

    expect(logger.default.error).toHaveBeenCalled();
    job.stopDeletionProcessor();
  });
});
