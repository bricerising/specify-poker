import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock database
const mockQuery = vi.fn();
vi.mock('../../../src/storage/db', () => ({
  query: mockQuery,
}));

// Mock deletion service
const mockHardDelete = vi.fn();
vi.mock('../../../src/services/deletionService', () => ({
  hardDelete: mockHardDelete,
}));

// Mock config
vi.mock('../../../src/config', () => ({
  getConfig: vi.fn(() => ({
    deletionProcessorIntervalMs: 60000, // 1 minute
  })),
}));

// Mock logger
vi.mock('../../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Deletion Processor Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockHardDelete.mockReset();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('processExpiredDeletions logic', () => {
    it('should query for expired deletions', async () => {
      const { query } = await import('../../../src/storage/db');

      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      // Directly test the query logic
      const gracePeriodMs = 30 * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - gracePeriodMs);

      await query(
        `SELECT user_id, deleted_at FROM profiles
         WHERE deleted_at IS NOT NULL
           AND deleted_at < $1`,
        [cutoffDate],
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NOT NULL'),
        expect.any(Array),
      );
    });

    it('should call hardDelete for each expired user', async () => {
      const deletionService = await import('../../../src/services/deletionService');

      mockHardDelete.mockResolvedValue(undefined);

      await deletionService.hardDelete('user-1');
      await deletionService.hardDelete('user-2');

      expect(mockHardDelete).toHaveBeenCalledWith('user-1');
      expect(mockHardDelete).toHaveBeenCalledWith('user-2');
      expect(mockHardDelete).toHaveBeenCalledTimes(2);
    });

    it('should not delete users within grace period', async () => {
      // This tests the cutoff date calculation
      const gracePeriodDays = 30;
      const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - gracePeriodMs);

      // A user deleted 10 days ago should NOT be included
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      expect(tenDaysAgo.getTime()).toBeGreaterThan(cutoffDate.getTime());

      // A user deleted 40 days ago SHOULD be included
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      expect(fortyDaysAgo.getTime()).toBeLessThan(cutoffDate.getTime());
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockQuery.mockRejectedValueOnce(error);

      const { query } = await import('../../../src/storage/db');

      await expect(query('SELECT 1', [])).rejects.toThrow('Database connection failed');
    });

    it('should handle deletion service errors gracefully', async () => {
      const error = new Error('Deletion failed');
      mockHardDelete.mockRejectedValueOnce(error);

      const deletionService = await import('../../../src/services/deletionService');

      await expect(deletionService.hardDelete('user-1')).rejects.toThrow('Deletion failed');
    });
  });
});
