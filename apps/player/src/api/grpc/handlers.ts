import { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";
import * as profileService from "../../services/profileService";
import * as statisticsService from "../../services/statisticsService";
import * as friendsService from "../../services/friendsService";
import { recordFriendMutation, recordGrpcRequest, recordProfileLookup, recordProfileUpdate, recordStatisticsUpdate } from "../../observability/metrics";
import { Profile, Statistics, FriendProfile, ThemePreference } from "../../domain/types";
import logger from "../../observability/logger";

type UnaryHandler<Req, Res> = (call: ServerUnaryCall<Req, Res>, callback: sendUnaryData<Res>) => Promise<void>;

function createUnaryHandler<Req, Res>(
  method: string,
  handler: (request: Req) => Promise<Res> | Res,
  hooks?: {
    onSuccess?: (request: Req, response: Res) => void;
    onError?: (request: Req, error: unknown) => void;
  }
): UnaryHandler<Req, Res> {
  return async (call, callback) => {
    const startedAt = Date.now();
    try {
      const response = await handler(call.request);
      hooks?.onSuccess?.(call.request, response);
      recordGrpcRequest(method, "ok", Date.now() - startedAt);
      callback(null, response);
    } catch (error: unknown) {
      hooks?.onError?.(call.request, error);
      logger.error({ err: error }, `${method} failed`);
      recordGrpcRequest(method, "error", Date.now() - startedAt);
      callback(error as Error);
    }
  };
}

interface GetProfileRequest {
  userId: string;
  referrerId?: string;
  username?: string;
}

interface GetProfilesRequest {
  userIds: string[];
}

interface UpdateProfileRequest {
  userId: string;
  nickname?: string;
  avatarUrl?: string;
  preferences?: {
    soundEnabled?: boolean;
    chatEnabled?: boolean;
    showHandStrength?: boolean;
    theme?: ThemePreference;
  };
}

interface DeleteProfileRequest {
  userId: string;
}

interface GetStatisticsRequest {
  userId: string;
}

interface IncrementStatisticRequest {
  userId: string;
  type: string;
  amount: number;
}

interface GetFriendsRequest {
  userId: string;
}

interface AddFriendRequest {
  userId: string;
  friendId: string;
}

interface RemoveFriendRequest {
  userId: string;
  friendId: string;
}

interface GetNicknamesRequest {
  userIds: string[];
}

function mapProfile(profile: Profile) {
  return {
    userId: profile.userId,
    username: profile.username,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl ?? "",
    preferences: {
      soundEnabled: profile.preferences.soundEnabled,
      chatEnabled: profile.preferences.chatEnabled,
      showHandStrength: profile.preferences.showHandStrength,
      theme: profile.preferences.theme,
    },
    lastLoginAt: profile.lastLoginAt ?? "",
    referredBy: profile.referredBy ?? "",
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function mapStatistics(stats: Statistics) {
  return {
    userId: stats.userId,
    handsPlayed: stats.handsPlayed,
    wins: stats.wins,
    vpip: stats.vpip,
    pfr: stats.pfr,
    allInCount: stats.allInCount,
    biggestPot: stats.biggestPot,
    referralCount: stats.referralCount,
    lastUpdated: stats.lastUpdated,
  };
}

function mapFriendProfile(friend: FriendProfile) {
  return {
    userId: friend.userId,
    nickname: friend.nickname,
    avatarUrl: friend.avatarUrl ?? "",
    status: friend.status ?? "",
  };
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const STATISTIC_TYPE_MAP = new Map<string, statisticsService.StatisticType>([
  ["STATISTIC_TYPE_HANDS_PLAYED", statisticsService.StatisticType.HandsPlayed],
  ["STATISTIC_TYPE_WINS", statisticsService.StatisticType.Wins],
  ["STATISTIC_TYPE_VPIP", statisticsService.StatisticType.Vpip],
  ["STATISTIC_TYPE_PFR", statisticsService.StatisticType.Pfr],
  ["STATISTIC_TYPE_ALL_IN", statisticsService.StatisticType.AllIn],
  ["STATISTIC_TYPE_BIGGEST_POT", statisticsService.StatisticType.BiggestPot],
  ["STATISTIC_TYPE_REFERRAL_COUNT", statisticsService.StatisticType.ReferralCount],
]);

function toStatisticType(value: string): statisticsService.StatisticType | null {
  return STATISTIC_TYPE_MAP.get(value) ?? null;
}

export const handlers = {
  GetProfile: createUnaryHandler<GetProfileRequest, unknown>("GetProfile", async (request) => {
      const profile = await profileService.getProfile(
        request.userId,
        normalizeOptionalString(request.referrerId),
        normalizeOptionalString(request.username)
      );
      recordProfileLookup(profile.deletedAt ? "deleted" : "ok");
      return { profile: mapProfile(profile) };
    }),

  GetProfiles: createUnaryHandler<GetProfilesRequest, unknown>("GetProfiles", async (request) => {
    const profiles = await profileService.getProfiles(request.userIds ?? []);
    return { profiles: profiles.map(mapProfile) };
  }),

  UpdateProfile: createUnaryHandler<UpdateProfileRequest, unknown>(
    "UpdateProfile",
    async (request) => {
      const nickname = normalizeOptionalString(request.nickname);
      const avatarUrlRaw = request.avatarUrl;
      const avatarUrl = avatarUrlRaw === "" ? null : normalizeOptionalString(avatarUrlRaw);
      const profile = await profileService.updateProfile(request.userId, {
        nickname,
        avatarUrl,
        preferences: request.preferences,
      });
      return { profile: mapProfile(profile) };
    },
    {
      onSuccess: () => recordProfileUpdate("ok"),
      onError: () => recordProfileUpdate("error"),
    }
  ),

  DeleteProfile: createUnaryHandler<DeleteProfileRequest, unknown>("DeleteProfile", async (request) => {
    await profileService.deleteProfile(request.userId);
    return { success: true };
  }),

  GetStatistics: createUnaryHandler<GetStatisticsRequest, unknown>("GetStatistics", async (request) => {
    const statistics = await statisticsService.getStatistics(request.userId);
    return { statistics: mapStatistics(statistics) };
  }),

  IncrementStatistic: createUnaryHandler<IncrementStatisticRequest, unknown>("IncrementStatistic", async (request) => {
    const type = toStatisticType(request.type);
      if (!type) {
        throw new Error("Invalid statistic type");
      }
    const updated = await statisticsService.incrementStatistic(request.userId, type, request.amount ?? 0);
    recordStatisticsUpdate(type);
    return mapStatistics(updated);
  }),

  GetFriends: createUnaryHandler<GetFriendsRequest, unknown>("GetFriends", async (request) => {
    const friends = await friendsService.getFriends(request.userId);
    return { friends: friends.map(mapFriendProfile) };
  }),

  AddFriend: createUnaryHandler<AddFriendRequest, unknown>(
    "AddFriend",
    async (request) => {
      await friendsService.addFriend(request.userId, request.friendId);
      return {};
    },
    {
      onSuccess: () => recordFriendMutation("add", "ok"),
      onError: () => recordFriendMutation("add", "error"),
    }
  ),

  RemoveFriend: createUnaryHandler<RemoveFriendRequest, unknown>(
    "RemoveFriend",
    async (request) => {
      await friendsService.removeFriend(request.userId, request.friendId);
      return {};
    },
    {
      onSuccess: () => recordFriendMutation("remove", "ok"),
      onError: () => recordFriendMutation("remove", "error"),
    }
  ),

  GetNicknames: createUnaryHandler<GetNicknamesRequest, unknown>("GetNicknames", async (request) => {
    const profiles = await profileService.getProfiles(request.userIds ?? []);
    const nicknames = profiles.map((profile) => ({
      userId: profile.userId,
      nickname: profile.nickname,
    }));
    return { nicknames };
  }),
};
