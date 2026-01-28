import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamService } from '../streamService';
import { cursorStore } from '../../storage/cursorStore';
import { streamStore } from '../../storage/streamStore';

vi.mock('../../storage/cursorStore', () => ({
  cursorStore: {
    getCursor: vi.fn(),
    upsertCursor: vi.fn(),
  },
}));

vi.mock('../../storage/streamStore', () => ({
  streamStore: {
    read: vi.fn(),
  },
}));

describe('StreamService', () => {
  const service = new StreamService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads cursor via store', async () => {
    vi.mocked(cursorStore.getCursor).mockResolvedValue(null);

    const result = await service.getCursor('table:t1', 'sub-1');

    expect(result).toBeNull();
    expect(cursorStore.getCursor).toHaveBeenCalledWith('table:t1', 'sub-1');
  });

  it('updates cursor via store', async () => {
    vi.mocked(cursorStore.upsertCursor).mockResolvedValue({
      cursorId: 'table:t1:sub-1',
      streamId: 'table:t1',
      subscriberId: 'sub-1',
      position: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.updateCursor('table:t1', 'sub-1', 10);

    expect(result.position).toBe(10);
    expect(cursorStore.upsertCursor).toHaveBeenCalledWith('table:t1', 'sub-1', 10);
  });

  it('reads stream messages', async () => {
    vi.mocked(streamStore.read).mockResolvedValue([{ name: 'stream', messages: [] }]);

    const result = await service.readStream('table:t1', '0-0');

    expect(result).toEqual([{ name: 'stream', messages: [] }]);
    expect(streamStore.read).toHaveBeenCalledWith('table:t1', '0-0');
  });
});
