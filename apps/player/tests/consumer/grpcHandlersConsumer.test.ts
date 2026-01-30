import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handlers } from '../../src/api/grpc/handlers';
import type { ServerUnaryCall } from '@grpc/grpc-js';
import * as profileService from '../../src/services/profileService';
import * as statisticsService from '../../src/services/statisticsService';
import * as friendsService from '../../src/services/friendsService';
import * as metrics from '../../src/observability/metrics';

vi.mock('../../src/services/profileService');
vi.mock('../../src/services/statisticsService');
vi.mock('../../src/services/friendsService');
vi.mock('../../src/observability/metrics', () => ({
  recordProfileLookup: vi.fn(),
  recordProfileUpdate: vi.fn(),
  recordFriendMutation: vi.fn(),
  recordGrpcRequest: vi.fn(),
  recordStatisticsUpdate: vi.fn(),
}));
vi.mock('../../src/observability/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

const callback = vi.fn();

describe('gRPC handlers consumer flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns profiles for batch lookup', async () => {
    vi.mocked(profileService.getProfiles).mockResolvedValue([
      {
        userId: 'user-1',
        username: 'user-1',
        nickname: 'Alpha',
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
      },
    ]);

    const call = { request: { userIds: ['user-1'] } } as unknown as ServerUnaryCall<
      { userIds: string[] },
      unknown
    >;
    await handlers.GetProfiles(call, callback);

    expect(profileService.getProfiles).toHaveBeenCalledWith(['user-1']);
    expect(callback).toHaveBeenCalledWith(null, {
      profiles: [expect.objectContaining({ userId: 'user-1', nickname: 'Alpha' })],
    });
    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith('GetProfiles', 'ok', expect.any(Number));
  });

  it('records deleted profile lookups', async () => {
    vi.mocked(profileService.getProfileWithLookupStatus).mockResolvedValue({
      profile: {
        userId: 'user-9',
        username: 'Deleted User',
        nickname: 'Deleted User',
        avatarUrl: null,
        preferences: {
          soundEnabled: false,
          chatEnabled: false,
          showHandStrength: false,
          theme: 'auto',
        },
        lastLoginAt: null,
        referredBy: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deletedAt: '2024-01-02T00:00:00Z',
      },
      lookupStatus: 'deleted',
    });

    const call = { request: { userId: 'user-9' } } as unknown as ServerUnaryCall<
      { userId: string; referrerId?: string },
      unknown
    >;
    await handlers.GetProfile(call, callback);

    expect(metrics.recordProfileLookup).toHaveBeenCalledWith('deleted');
  });

  it('records created profile lookups', async () => {
    vi.mocked(profileService.getProfileWithLookupStatus).mockResolvedValue({
      profile: {
        userId: 'user-new',
        username: 'user-new',
        nickname: 'NewUser',
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
      },
      lookupStatus: 'created',
    });

    const call = { request: { userId: 'user-new' } } as unknown as ServerUnaryCall<
      { userId: string; referrerId?: string },
      unknown
    >;
    await handlers.GetProfile(call, callback);

    expect(metrics.recordProfileLookup).toHaveBeenCalledWith('created');
  });

  it('returns nicknames for batch nickname lookup', async () => {
    vi.mocked(profileService.getProfiles).mockResolvedValue([
      {
        userId: 'user-1',
        username: 'user-1',
        nickname: 'Alpha',
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
      },
      {
        userId: 'user-2',
        username: 'user-2',
        nickname: 'Beta',
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
      },
    ]);

    const call = { request: { userIds: ['user-1', 'user-2'] } } as unknown as ServerUnaryCall<
      { userIds: string[] },
      unknown
    >;
    await handlers.GetNicknames(call, callback);

    expect(callback).toHaveBeenCalledWith(null, {
      nicknames: [
        { userId: 'user-1', nickname: 'Alpha' },
        { userId: 'user-2', nickname: 'Beta' },
      ],
    });
    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'GetNicknames',
      'ok',
      expect.any(Number),
    );
  });

  it('normalizes empty avatar URLs on profile updates', async () => {
    vi.mocked(profileService.updateProfile).mockResolvedValue({
      ok: true,
      value: {
        userId: 'user-1',
        username: 'user-1',
        nickname: 'Alpha',
        avatarUrl: null,
        preferences: { soundEnabled: true, chatEnabled: true, showHandStrength: true, theme: 'auto' },
        lastLoginAt: null,
        referredBy: null,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deletedAt: null,
      },
    });

    const call = {
      request: {
        userId: 'user-1',
        nickname: 'Alpha',
        avatarUrl: '',
      },
    } as unknown as ServerUnaryCall<
      { userId: string; nickname?: string; avatarUrl?: string },
      unknown
    >;
    await handlers.UpdateProfile(call, callback);

    expect(profileService.updateProfile).toHaveBeenCalledWith('user-1', {
      nickname: 'Alpha',
      avatarUrl: null,
      preferences: undefined,
    });
    expect(metrics.recordProfileUpdate).toHaveBeenCalledWith('ok');
  });

  it('returns error for invalid statistic type', async () => {
    const call = {
      request: { userId: 'user-1', type: 'STATISTIC_TYPE_UNKNOWN', amount: 5 },
    } as unknown as ServerUnaryCall<{ userId: string; type: string; amount: number }, unknown>;
    await handlers.IncrementStatistic(call, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'IncrementStatistic',
      'error',
      expect.any(Number),
    );
    expect(metrics.recordStatisticsUpdate).not.toHaveBeenCalled();
  });

  it('returns error for invalid statistic amount', async () => {
    const call = {
      request: { userId: 'user-1', type: 'STATISTIC_TYPE_HANDS_PLAYED', amount: Number.NaN },
    } as unknown as ServerUnaryCall<{ userId: string; type: string; amount: number }, unknown>;
    await handlers.IncrementStatistic(call, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'IncrementStatistic',
      'error',
      expect.any(Number),
    );
    expect(metrics.recordStatisticsUpdate).not.toHaveBeenCalled();
  });

  it('increments statistics with a valid type', async () => {
    vi.mocked(statisticsService.incrementStatistic).mockResolvedValue({
      userId: 'user-1',
      handsPlayed: 1,
      wins: 0,
      vpip: 0,
      pfr: 0,
      allInCount: 0,
      biggestPot: 0,
      referralCount: 0,
      lastUpdated: '2024-01-01T00:00:00Z',
    });

    const call = {
      request: { userId: 'user-1', type: 'STATISTIC_TYPE_HANDS_PLAYED', amount: 1 },
    } as unknown as ServerUnaryCall<{ userId: string; type: string; amount: number }, unknown>;
    await handlers.IncrementStatistic(call, callback);

    expect(metrics.recordStatisticsUpdate).toHaveBeenCalledWith('hands_played');
    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'IncrementStatistic',
      'ok',
      expect.any(Number),
    );
  });

  it('supports friend removal via gRPC', async () => {
    const call = {
      request: { userId: 'user-1', friendId: 'user-2' },
    } as unknown as ServerUnaryCall<{ userId: string; friendId: string }, unknown>;
    await handlers.RemoveFriend(call, callback);

    expect(friendsService.removeFriend).toHaveBeenCalledWith('user-1', 'user-2');
    expect(metrics.recordFriendMutation).toHaveBeenCalledWith('remove', 'ok');
  });

  it('records errors when profile lookup fails', async () => {
    vi.mocked(profileService.getProfileWithLookupStatus).mockRejectedValue(new Error('boom'));

    const call = { request: { userId: 'user-1' } } as unknown as ServerUnaryCall<
      { userId: string; referrerId?: string },
      unknown
    >;
    await handlers.GetProfile(call, callback);

    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'GetProfile',
      'error',
      expect.any(Number),
    );
  });

  it('records errors when friend mutation fails', async () => {
    vi.mocked(friendsService.addFriend).mockRejectedValue(new Error('boom'));

    const call = {
      request: { userId: 'user-1', friendId: 'user-2' },
    } as unknown as ServerUnaryCall<{ userId: string; friendId: string }, unknown>;
    await handlers.AddFriend(call, callback);

    expect(metrics.recordFriendMutation).toHaveBeenCalledWith('add', 'error');
    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'AddFriend',
      'error',
      expect.any(Number),
    );
  });

  it('records errors when delete fails', async () => {
    vi.mocked(profileService.deleteProfile).mockRejectedValue(new Error('boom'));

    const call = { request: { userId: 'user-1' } } as unknown as ServerUnaryCall<
      { userId: string },
      unknown
    >;
    await handlers.DeleteProfile(call, callback);

    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'DeleteProfile',
      'error',
      expect.any(Number),
    );
  });

  it('records errors when statistics lookup fails', async () => {
    vi.mocked(statisticsService.getStatistics).mockRejectedValue(new Error('boom'));

    const call = { request: { userId: 'user-1' } } as unknown as ServerUnaryCall<
      { userId: string },
      unknown
    >;
    await handlers.GetStatistics(call, callback);

    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'GetStatistics',
      'error',
      expect.any(Number),
    );
  });

  it('records errors when batch lookup fails', async () => {
    vi.mocked(profileService.getProfiles).mockRejectedValue(new Error('boom'));

    const call = { request: { userIds: ['user-1'] } } as unknown as ServerUnaryCall<
      { userIds: string[] },
      unknown
    >;
    await handlers.GetProfiles(call, callback);

    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'GetProfiles',
      'error',
      expect.any(Number),
    );
  });

  it('records errors when friends lookup fails', async () => {
    vi.mocked(friendsService.getFriends).mockRejectedValue(new Error('boom'));

    const call = { request: { userId: 'user-1' } } as unknown as ServerUnaryCall<
      { userId: string },
      unknown
    >;
    await handlers.GetFriends(call, callback);

    expect(metrics.recordGrpcRequest).toHaveBeenCalledWith(
      'GetFriends',
      'error',
      expect.any(Number),
    );
  });
});
