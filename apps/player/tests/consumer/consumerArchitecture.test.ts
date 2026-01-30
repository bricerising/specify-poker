import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as profileService from '../../src/services/profileService';
import * as friendsService from '../../src/services/friendsService';
import { EventConsumer } from '../../src/services/eventConsumer';
import * as profileRepository from '../../src/storage/profileRepository';
import * as profileCache from '../../src/storage/profileCache';
import * as deletedCache from '../../src/storage/deletedCache';
import * as nicknameService from '../../src/services/nicknameService';
import * as statisticsService from '../../src/services/statisticsService';
import * as eventProducer from '../../src/services/eventProducer';
import * as friendsRepository from '../../src/storage/friendsRepository';
import * as friendsCache from '../../src/storage/friendsCache';

vi.mock('../../src/storage/profileRepository');
vi.mock('../../src/storage/profileCache');
vi.mock('../../src/storage/deletedCache');
vi.mock('../../src/services/nicknameService');
vi.mock('../../src/services/statisticsService');
vi.mock('../../src/services/eventProducer');
vi.mock('../../src/storage/friendsRepository');
vi.mock('../../src/storage/friendsCache');

describe('Player service consumer architecture', () => {
  const baseProfile = {
    userId: 'user-1',
    username: 'user-1',
    nickname: 'PlayerOne',
    avatarUrl: 'https://example.com/avatar.png',
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

  it('auto-provisions profiles on first access', async () => {
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
    vi.mocked(profileCache.get).mockResolvedValue(null);
    vi.mocked(profileRepository.findById).mockResolvedValue(null);
    vi.mocked(nicknameService.generateNickname).mockResolvedValue('PlayerAuto');
    vi.mocked(profileRepository.create).mockResolvedValue({
      profile: {
        ...baseProfile,
        userId: 'user-new',
        nickname: 'PlayerAuto',
      },
      created: true,
    });

    const profile = await profileService.getProfile('user-new');

    expect(profile.nickname).toBe('PlayerAuto');
    expect(profileRepository.create).toHaveBeenCalled();
    expect(profileCache.set).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-new' }));
  });

  it('emits daily login events once per day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-02T12:00:00Z'));
    try {
      const cached = { ...baseProfile, lastLoginAt: '2024-01-01T00:00:00Z' };
      vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
      vi.mocked(profileCache.get).mockResolvedValue(cached);
      vi.mocked(profileRepository.update).mockResolvedValue({
        ...cached,
        lastLoginAt: '2024-01-02T12:00:00Z',
        updatedAt: '2024-01-02T12:00:00Z',
      });

      await profileService.getProfile('user-1');

      expect(eventProducer.publishEvent).toHaveBeenCalledWith(
        'DAILY_LOGIN',
        { userId: 'user-1', date: '2024-01-02' },
        'user-1',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks referrals with statistics and event emission', async () => {
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
    vi.mocked(profileCache.get).mockResolvedValue(null);
    vi.mocked(profileRepository.findById).mockResolvedValue(null);
    vi.mocked(nicknameService.generateNickname).mockResolvedValue('PlayerRef');
    vi.mocked(profileRepository.create).mockResolvedValue({
      profile: {
        ...baseProfile,
        userId: 'user-new',
        nickname: 'PlayerRef',
        referredBy: 'referrer-1',
      },
      created: true,
    });

    await profileService.getProfile('user-new', 'referrer-1');

    expect(statisticsService.incrementReferralCount).toHaveBeenCalledWith('referrer-1', 1);
    expect(eventProducer.publishEvent).toHaveBeenCalledWith(
      'REFERRAL_REWARD',
      { referrerId: 'referrer-1', referredId: 'user-new' },
      'referrer-1',
    );
  });

  it('rejects invalid avatar URLs on profile updates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T10:00:00Z'));
    try {
      vi.mocked(deletedCache.isDeleted).mockResolvedValue(false);
      vi.mocked(profileCache.get).mockResolvedValue(baseProfile);

      const result = await profileService.updateProfile('user-1', { avatarUrl: 'not-a-url' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('InvalidAvatarUrl');
        if (result.error.type === 'InvalidAvatarUrl') {
          expect(result.error.url).toBe('not-a-url');
        }
      }
      expect(profileRepository.update).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a placeholder profile for deleted users', async () => {
    vi.mocked(deletedCache.isDeleted).mockResolvedValue(true);

    const profile = await profileService.getProfile('user-deleted');

    expect(profile.nickname).toBe('Deleted User');
    expect(profile.avatarUrl).toBeNull();
    expect(profileRepository.findById).not.toHaveBeenCalled();
  });

  it('returns friend profiles with nicknames and avatars', async () => {
    const summaries = [
      { userId: 'friend-1', nickname: 'Buddy', avatarUrl: 'https://example.com/buddy.png' },
      { userId: 'friend-2', nickname: 'Pal', avatarUrl: null },
    ];
    vi.mocked(friendsCache.get).mockResolvedValue(null);
    vi.mocked(friendsRepository.getFriends).mockResolvedValue(['friend-1', 'friend-2']);
    const summariesSpy = vi
      .spyOn(profileService, 'getProfileSummaries')
      .mockResolvedValue(summaries);

    const friends = await friendsService.getFriends('user-1');

    expect(friends).toEqual(summaries);
    expect(friendsCache.set).toHaveBeenCalledWith('user-1', ['friend-1', 'friend-2']);
    summariesSpy.mockRestore();
  });

  it('updates statistics based on hand events', async () => {
    const consumer = new EventConsumer();

    await consumer.handleEvent({
      type: 'HAND_STARTED',
      payload: {
        fields: {
          participants: {
            listValue: { values: [{ stringValue: 'user-1' }, { stringValue: 'user-2' }] },
          },
        },
      },
    });

    expect(statisticsService.incrementHandsPlayed).toHaveBeenCalledWith('user-1');
    expect(statisticsService.incrementHandsPlayed).toHaveBeenCalledWith('user-2');
  });
});
