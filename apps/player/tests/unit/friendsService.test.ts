import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as friendsService from '../../src/services/friendsService';
import * as friendsRepository from '../../src/storage/friendsRepository';
import * as friendsCache from '../../src/storage/friendsCache';
import * as profileService from '../../src/services/profileService';

vi.mock('../../src/storage/friendsRepository');
vi.mock('../../src/storage/friendsCache');
vi.mock('../../src/services/profileService');

describe('friendsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks adding yourself as a friend', async () => {
    await expect(friendsService.addFriend('user-1', 'user-1')).rejects.toThrow(
      'Cannot add yourself as a friend',
    );
    expect(friendsRepository.addFriend).not.toHaveBeenCalled();
  });

  it('returns cached friends list with profile summaries', async () => {
    vi.mocked(friendsCache.get).mockResolvedValue(['friend-1']);
    vi.mocked(profileService.getProfileSummaries).mockResolvedValue([
      { userId: 'friend-1', nickname: 'Buddy', avatarUrl: null },
    ]);

    const friends = await friendsService.getFriends('user-1');

    expect(friends).toEqual([{ userId: 'friend-1', nickname: 'Buddy', avatarUrl: null }]);
    expect(friendsRepository.getFriends).not.toHaveBeenCalled();
  });
});
