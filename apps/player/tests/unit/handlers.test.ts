import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handlers } from '../../src/api/grpc/handlers';
import type { ServerUnaryCall } from '@grpc/grpc-js';
import * as profileService from '../../src/services/profileService';
import * as statisticsService from '../../src/services/statisticsService';
import * as friendsService from '../../src/services/friendsService';

vi.mock('../../src/services/profileService');
vi.mock('../../src/services/statisticsService');
vi.mock('../../src/services/friendsService');

const callback = vi.fn();

describe('gRPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GetProfile', () => {
    it('should return profile', async () => {
      const mockProfile = {
        userId: 'user1',
        username: 'user1',
        nickname: 'Nick',
        avatarUrl: null,
        preferences: {
          soundEnabled: true,
          chatEnabled: true,
          showHandStrength: true,
          theme: 'auto',
        },
        lastLoginAt: null,
        referredBy: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deletedAt: null,
      };
      vi.mocked(profileService.getProfileWithLookupStatus).mockResolvedValue({
        profile: mockProfile,
        lookupStatus: 'ok',
      });

      const call = {
        request: { userId: 'user1', referrerId: 'ref1' },
      } as unknown as ServerUnaryCall<{ userId: string; referrerId?: string }, unknown>;
      await handlers.GetProfile(call, callback);

      expect(profileService.getProfileWithLookupStatus).toHaveBeenCalledWith('user1', 'ref1', undefined);
      expect(callback).toHaveBeenCalledWith(null, {
        profile: expect.objectContaining({ userId: 'user1', username: 'user1', nickname: 'Nick' }),
      });
    });
  });

  describe('UpdateProfile', () => {
    it('should update and return profile', async () => {
      const mockProfile = {
        userId: 'user1',
        username: 'user1',
        nickname: 'NewNick',
        avatarUrl: 'https://example.com/avatar.png',
        preferences: {
          soundEnabled: true,
          chatEnabled: true,
          showHandStrength: true,
          theme: 'auto',
        },
        lastLoginAt: null,
        referredBy: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deletedAt: null,
      };
      vi.mocked(profileService.updateProfile).mockResolvedValue({ ok: true, value: mockProfile });

      const call = {
        request: { userId: 'user1', nickname: 'NewNick' },
      } as unknown as ServerUnaryCall<{ userId: string; nickname?: string }, unknown>;
      await handlers.UpdateProfile(call, callback);

      expect(callback).toHaveBeenCalledWith(null, {
        profile: expect.objectContaining({
          userId: 'user1',
          username: 'user1',
          nickname: 'NewNick',
        }),
      });
    });
  });

  describe('GetStatistics', () => {
    it('should return statistics', async () => {
      const mockStats = {
        userId: 'user1',
        handsPlayed: 10,
        wins: 5,
        vpip: 15,
        pfr: 5,
        allInCount: 1,
        biggestPot: 200,
        referralCount: 2,
        lastUpdated: '2024-01-01T00:00:00Z',
      };
      vi.mocked(statisticsService.getStatistics).mockResolvedValue(mockStats);

      const call = { request: { userId: 'user1' } } as unknown as ServerUnaryCall<
        { userId: string },
        unknown
      >;
      await handlers.GetStatistics(call, callback);

      expect(callback).toHaveBeenCalledWith(null, {
        statistics: expect.objectContaining({ userId: 'user1' }),
      });
    });
  });

  describe('AddFriend', () => {
    it('should add friend', async () => {
      vi.mocked(friendsService.addFriend).mockResolvedValue({ ok: true, value: undefined });

      const call = {
        request: { userId: 'user1', friendId: 'user2' },
      } as unknown as ServerUnaryCall<{ userId: string; friendId: string }, unknown>;
      await handlers.AddFriend(call, callback);

      expect(friendsService.addFriend).toHaveBeenCalledWith('user1', 'user2');
      expect(callback).toHaveBeenCalledWith(null, {});
    });
  });

  describe('GetFriends', () => {
    it('should return friend profiles', async () => {
      const mockFriends = [{ userId: 'user2', nickname: 'Friend', avatarUrl: null }];
      vi.mocked(friendsService.getFriends).mockResolvedValue(mockFriends);

      const call = { request: { userId: 'user1' } } as unknown as ServerUnaryCall<
        { userId: string },
        unknown
      >;
      await handlers.GetFriends(call, callback);

      expect(callback).toHaveBeenCalledWith(null, { friends: expect.any(Array) });
    });
  });

  describe('DeleteProfile', () => {
    it('should delete profile', async () => {
      const call = { request: { userId: 'user1' } } as unknown as ServerUnaryCall<
        { userId: string },
        unknown
      >;
      await handlers.DeleteProfile(call, callback);

      expect(profileService.deleteProfile).toHaveBeenCalledWith('user1');
      expect(callback).toHaveBeenCalledWith(null, { success: true });
    });
  });
});
