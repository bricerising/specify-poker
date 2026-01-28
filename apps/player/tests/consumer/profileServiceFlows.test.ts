import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as profileService from '../../src/services/profileService';
import * as profileRepository from '../../src/storage/profileRepository';
import * as profileCache from '../../src/storage/profileCache';
import * as deletedCache from '../../src/storage/deletedCache';
import * as nicknameService from '../../src/services/nicknameService';
import * as statisticsService from '../../src/services/statisticsService';
import * as eventProducer from '../../src/services/eventProducer';

vi.mock('../../src/storage/profileRepository');
vi.mock('../../src/storage/profileCache');
vi.mock('../../src/storage/deletedCache');
vi.mock('../../src/services/nicknameService');
vi.mock('../../src/services/statisticsService');
vi.mock('../../src/services/eventProducer');

describe('profileService consumer flows', () => {
  const baseProfile = {
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

  it('returns a deleted placeholder when cached deletion is present', async () => {
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(true);

    const profile = await profileService.getProfile('user-1');

    expect(profile.nickname).toBe('Deleted User');
    expect(profileCache.get).not.toHaveBeenCalled();
  });

  it('returns cached profiles without emitting daily login events on same day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    try {
      vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
      vi.mocked(profileCache.get).mockResolvedValue(baseProfile);

      const profile = await profileService.getProfile('user-1');

      expect(profile.userId).toBe('user-1');
      expect(profileRepository.update).not.toHaveBeenCalled();
      expect(eventProducer.publishEvent).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates last login and emits daily login events on new days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-02T12:00:00Z'));
    try {
      vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
      vi.mocked(profileCache.get).mockResolvedValue(baseProfile);
      vi.mocked(profileRepository.update).mockResolvedValue({
        ...baseProfile,
        lastLoginAt: '2024-01-02T12:00:00Z',
        updatedAt: '2024-01-02T12:00:00Z',
      });

      const profile = await profileService.getProfile('user-1');

      expect(profile.lastLoginAt).toContain('2024-01-02T12:00:00');
      expect(profileCache.set).toHaveBeenCalled();
      expect(eventProducer.publishEvent).toHaveBeenCalledWith(
        'DAILY_LOGIN',
        { userId: 'user-1', date: '2024-01-02' },
        'user-1',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks deleted profiles when found in storage', async () => {
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
    vi.mocked(profileCache.get).mockResolvedValue(null);
    vi.mocked(profileRepository.findById).mockResolvedValue({
      ...baseProfile,
      deletedAt: '2024-01-02T00:00:00Z',
    });

    const profile = await profileService.getProfile('user-1');

    expect(profile.nickname).toBe('Deleted User');
    expect(deletedCache.markDeleted).toHaveBeenCalledWith('user-1');
  });

  it('does not reward self-referrals on profile creation', async () => {
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
    vi.mocked(profileCache.get).mockResolvedValue(null);
    vi.mocked(profileRepository.findById).mockResolvedValue(null);
    vi.mocked(nicknameService.generateNickname).mockResolvedValue('PlayerSelf');
    vi.mocked(profileRepository.create).mockResolvedValue({
      profile: { ...baseProfile, nickname: 'PlayerSelf' },
      created: true,
    });

    await profileService.getProfile('user-1', 'user-1');

    expect(statisticsService.incrementReferralCount).not.toHaveBeenCalled();
    expect(eventProducer.publishEvent).not.toHaveBeenCalled();
  });
});
