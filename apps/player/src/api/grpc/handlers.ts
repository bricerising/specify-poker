import * as profileService from '../../services/profileService';
import * as statisticsService from '../../services/statisticsService';
import * as friendsService from '../../services/friendsService';
import {
  recordFriendMutation,
  recordGrpcRequest,
  recordProfileLookup,
  recordProfileUpdate,
  recordStatisticsUpdate,
} from '../../observability/metrics';
import type { ServerUnaryCall, ServiceError } from '@grpc/grpc-js';
import logger from '../../observability/logger';
import { ValidationError } from '../../domain/errors';
import { toGrpcServiceError, updateProfileErrorToGrpc, addFriendErrorToGrpc } from './errors';
import {
  createUnaryHandler,
  withUnaryErrorHandling,
  withUnaryHooks,
  withUnaryTiming,
} from '@specify-poker/shared';
import {
  decodeAddFriendRequest,
  decodeDeleteProfileRequest,
  decodeGetFriendsRequest,
  decodeGetNicknamesRequest,
  decodeGetProfileRequest,
  decodeGetProfilesRequest,
  decodeGetStatisticsRequest,
  decodeIncrementStatisticRequest,
  decodeRemoveFriendRequest,
  decodeUpdateProfileRequest,
} from './decoders';
import { toGrpcFriendProfile, toGrpcProfile, toGrpcStatistics } from './mappers';

function createPlayerUnaryHandler<Req, Res>(
  method: string,
  decode: (request: unknown) => Req,
  handler: (request: Req) => Promise<Res> | Res,
  hooks?: {
    onSuccess?: (request: unknown, response: Res) => void;
    onError?: (request: unknown, error: unknown) => void;
  },
) {
  return createUnaryHandler<unknown, Res, ServerUnaryCall<unknown, Res>, ServiceError>({
    handler: ({ request }) => handler(decode(request)),
    interceptors: [
      withUnaryTiming({ method, record: recordGrpcRequest }),
      withUnaryErrorHandling({ method, logger, toServiceError: toGrpcServiceError }),
      withUnaryHooks(
        hooks
          ? {
              onSuccess: ({ request }, response) => hooks.onSuccess?.(request, response),
              onError: ({ request }, error) => hooks.onError?.(request, error),
            }
          : undefined,
      ),
    ],
  });
}

const STATISTIC_TYPE_MAP = new Map<string, statisticsService.StatisticType>([
  ['STATISTIC_TYPE_HANDS_PLAYED', statisticsService.StatisticType.HandsPlayed],
  ['STATISTIC_TYPE_WINS', statisticsService.StatisticType.Wins],
  ['STATISTIC_TYPE_VPIP', statisticsService.StatisticType.Vpip],
  ['STATISTIC_TYPE_PFR', statisticsService.StatisticType.Pfr],
  ['STATISTIC_TYPE_ALL_IN', statisticsService.StatisticType.AllIn],
  ['STATISTIC_TYPE_BIGGEST_POT', statisticsService.StatisticType.BiggestPot],
  ['STATISTIC_TYPE_REFERRAL_COUNT', statisticsService.StatisticType.ReferralCount],
]);

function toStatisticType(value: string): statisticsService.StatisticType | null {
  return STATISTIC_TYPE_MAP.get(value) ?? null;
}

export const handlers = {
  GetProfile: createPlayerUnaryHandler(
    'GetProfile',
    decodeGetProfileRequest,
    async ({ userId, referrerId, username }) => {
      const { profile, lookupStatus } = await profileService.getProfileWithLookupStatus(
        userId,
        referrerId,
        username,
      );
      recordProfileLookup(lookupStatus);
      return { profile: toGrpcProfile(profile) };
    },
  ),

  GetProfiles: createPlayerUnaryHandler(
    'GetProfiles',
    decodeGetProfilesRequest,
    async ({ userIds }) => {
      const profiles = await profileService.getProfiles(userIds);
      return { profiles: profiles.map(toGrpcProfile) };
    },
  ),

  UpdateProfile: createPlayerUnaryHandler(
    'UpdateProfile',
    decodeUpdateProfileRequest,
    async (request) => {
      const { userId, nickname, avatarUrl, preferences } = request;
      const result = await profileService.updateProfile(userId, {
        nickname,
        avatarUrl,
        preferences,
      });
      if (!result.ok) {
        throw updateProfileErrorToGrpc(result.error);
      }
      return { profile: toGrpcProfile(result.value) };
    },
    {
      onSuccess: () => recordProfileUpdate('ok'),
      onError: () => recordProfileUpdate('error'),
    },
  ),

  DeleteProfile: createPlayerUnaryHandler(
    'DeleteProfile',
    decodeDeleteProfileRequest,
    async (request) => {
      const { userId } = request;
      await profileService.deleteProfile(userId);
      return { success: true };
    },
  ),

  GetStatistics: createPlayerUnaryHandler(
    'GetStatistics',
    decodeGetStatisticsRequest,
    async ({ userId }) => {
      const statistics = await statisticsService.getStatistics(userId);
      return { statistics: toGrpcStatistics(statistics) };
    },
  ),

  IncrementStatistic: createPlayerUnaryHandler(
    'IncrementStatistic',
    decodeIncrementStatisticRequest,
    async (request) => {
      const { userId, type, amount, idempotencyKey } = request;
      const statisticType = toStatisticType(type);
      if (!statisticType) {
        throw new ValidationError('Invalid statistic type');
      }
      const updated = await statisticsService.incrementStatisticIdempotent(
        userId,
        statisticType,
        amount,
        idempotencyKey,
      );
      recordStatisticsUpdate(statisticType);
      return toGrpcStatistics(updated);
    },
  ),

  GetFriends: createPlayerUnaryHandler(
    'GetFriends',
    decodeGetFriendsRequest,
    async ({ userId }) => {
      const friends = await friendsService.getFriends(userId);
      return { friends: friends.map(toGrpcFriendProfile) };
    },
  ),

  AddFriend: createPlayerUnaryHandler(
    'AddFriend',
    decodeAddFriendRequest,
    async (request) => {
      const { userId, friendId } = request;
      const result = await friendsService.addFriend(userId, friendId);
      if (!result.ok) {
        throw addFriendErrorToGrpc(result.error);
      }
      return {};
    },
    {
      onSuccess: () => recordFriendMutation('add', 'ok'),
      onError: () => recordFriendMutation('add', 'error'),
    },
  ),

  RemoveFriend: createPlayerUnaryHandler(
    'RemoveFriend',
    decodeRemoveFriendRequest,
    async (request) => {
      const { userId, friendId } = request;
      await friendsService.removeFriend(userId, friendId);
      return {};
    },
    {
      onSuccess: () => recordFriendMutation('remove', 'ok'),
      onError: () => recordFriendMutation('remove', 'error'),
    },
  ),

  GetNicknames: createPlayerUnaryHandler(
    'GetNicknames',
    decodeGetNicknamesRequest,
    async ({ userIds }) => {
      const profiles = await profileService.getProfiles(userIds);
      const nicknames = profiles.map((profile) => ({
        userId: profile.userId,
        nickname: profile.nickname,
      }));
      return { nicknames };
    },
  ),
};
