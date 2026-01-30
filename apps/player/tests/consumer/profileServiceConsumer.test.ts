import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as profileService from '../../src/services/profileService';
import * as profileRepository from '../../src/storage/profileRepository';
import * as profileCache from '../../src/storage/profileCache';
import * as deletedCache from '../../src/storage/deletedCache';
import * as nicknameService from '../../src/services/nicknameService';

vi.mock('../../src/storage/profileRepository');
vi.mock('../../src/storage/profileCache');
vi.mock('../../src/storage/deletedCache');
vi.mock('../../src/services/nicknameService');
vi.mock('../../src/services/eventProducer', () => ({
  publishEvent: vi.fn(),
}));
vi.mock('../../src/services/statisticsService', () => ({
  incrementReferralCount: vi.fn(),
}));

describe('profileService consumer flows', () => {
  const activeProfile = {
    userId: 'user-1',
    username: 'user-1',
    nickname: 'PlayerOne',
    avatarUrl: null,
    preferences: { soundEnabled: true, chatEnabled: true, showHandStrength: true, theme: 'auto' },
    lastLoginAt: '2024-01-01T00:00:00Z',
    referredBy: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached and deleted profiles in batch lookups', async () => {
    const cachedMap = new Map<string, typeof activeProfile>();
    cachedMap.set('user-1', activeProfile);
    vi.mocked(profileCache.getMulti).mockResolvedValue(cachedMap);
    vi.mocked(deletedCache.isDeletedMulti).mockResolvedValue(new Set());
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
    vi.mocked(profileRepository.findByIds).mockResolvedValue([
      {
        ...activeProfile,
        userId: 'user-2',
        nickname: 'OldUser',
        deletedAt: '2024-01-02T00:00:00Z',
      },
    ]);

    const profiles = await profileService.getProfiles(['user-1', 'user-2']);

    expect(profiles[0]?.userId).toBe('user-1');
    expect(profiles[1]?.nickname).toBe('Deleted User');
    expect(deletedCache.markDeleted).toHaveBeenCalledWith('user-2');
  });

  it('returns a deleted placeholder when a cached profile is marked deleted', async () => {
    const cachedMap = new Map<string, typeof activeProfile>();
    cachedMap.set('user-1', { ...activeProfile, deletedAt: '2024-01-02T00:00:00Z' });
    vi.mocked(profileCache.getMulti).mockResolvedValue(cachedMap);
    vi.mocked(deletedCache.isDeletedMulti).mockResolvedValue(new Set());

    const profiles = await profileService.getProfiles(['user-1']);

    expect(profiles[0]?.nickname).toBe('Deleted User');
    expect(deletedCache.markDeleted).toHaveBeenCalledWith('user-1');
  });

  it('rejects nickname updates when unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
    vi.mocked(profileCache.get).mockResolvedValue(activeProfile);
    vi.mocked(nicknameService.normalizeNickname).mockReturnValue('Taken');
    vi.mocked(nicknameService.isAvailableForUser).mockResolvedValue(false);

    try {
      await expect(profileService.updateProfile('user-1', { nickname: 'Taken' })).rejects.toThrow(
        'Nickname is not available',
      );
      expect(profileRepository.update).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
