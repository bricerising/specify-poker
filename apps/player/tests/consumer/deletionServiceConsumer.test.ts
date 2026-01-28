import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as deletionService from '../../src/services/deletionService';
import * as profileRepository from '../../src/storage/profileRepository';
import * as friendsRepository from '../../src/storage/friendsRepository';
import * as profileCache from '../../src/storage/profileCache';
import * as friendsCache from '../../src/storage/friendsCache';
import * as statisticsCache from '../../src/storage/statisticsCache';
import * as deletedCache from '../../src/storage/deletedCache';
import * as statisticsRepository from '../../src/storage/statisticsRepository';

vi.mock('../../src/storage/profileRepository');
vi.mock('../../src/storage/friendsRepository');
vi.mock('../../src/storage/profileCache');
vi.mock('../../src/storage/friendsCache');
vi.mock('../../src/storage/statisticsCache');
vi.mock('../../src/storage/deletedCache');
vi.mock('../../src/storage/statisticsRepository');

describe('deletionService consumer behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('anonymizes and invalidates data on deletion requests', async () => {
    vi.mocked(profileRepository.findById).mockResolvedValue({
      userId: 'user-1',
      username: 'user-1',
      nickname: 'OldNick',
      avatarUrl: null,
      preferences: { soundEnabled: true, chatEnabled: true, showHandStrength: true, theme: 'auto' },
      lastLoginAt: null,
      referredBy: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
    });
    vi.mocked(friendsRepository.getFriends).mockResolvedValue(['friend-1', 'friend-2']);
    vi.mocked(statisticsRepository.findById).mockResolvedValue({
      userId: 'user-1',
      handsPlayed: 10,
      wins: 2,
      vpip: 20,
      pfr: 10,
      allInCount: 1,
      biggestPot: 50,
      referralCount: 1,
      lastUpdated: '2024-01-01T00:00:00Z',
    });

    await deletionService.requestDeletion('user-1');

    expect(profileRepository.softDelete).toHaveBeenCalled();
    expect(friendsRepository.removeAllReferences).toHaveBeenCalledWith('user-1');
    expect(statisticsRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        handsPlayed: 0,
        wins: 0,
        biggestPot: 0,
        referralCount: 0,
      }),
    );
    expect(profileCache.deleteNickname).toHaveBeenCalledWith('OldNick');
    expect(profileCache.invalidate).toHaveBeenCalledWith('user-1');
    expect(friendsCache.invalidate).toHaveBeenCalledWith('user-1');
    expect(statisticsCache.invalidate).toHaveBeenCalledWith('user-1');
    expect(deletedCache.markDeleted).toHaveBeenCalledWith('user-1');
    expect(friendsCache.invalidate).toHaveBeenCalledWith('friend-1');
    expect(friendsCache.invalidate).toHaveBeenCalledWith('friend-2');
  });

  it('purges data on hard delete', async () => {
    await deletionService.hardDelete('user-2');

    expect(friendsRepository.removeAllReferences).toHaveBeenCalledWith('user-2');
    expect(profileRepository.hardDelete).toHaveBeenCalledWith('user-2');
    expect(profileCache.invalidate).toHaveBeenCalledWith('user-2');
    expect(friendsCache.invalidate).toHaveBeenCalledWith('user-2');
    expect(statisticsCache.invalidate).toHaveBeenCalledWith('user-2');
    expect(deletedCache.clearDeleted).toHaveBeenCalledWith('user-2');
  });
});
