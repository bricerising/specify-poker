import { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";
import * as profileService from "../../services/profileService";
import * as statisticsService from "../../services/statisticsService";
import * as friendsService from "../../services/friendsService";
import { recordFriendMutation, recordGrpcRequest, recordProfileLookup, recordProfileUpdate, recordStatisticsUpdate } from "../../observability/metrics";
import { Profile, Statistics, FriendProfile, ThemePreference } from "../../domain/types";
import logger from "../../observability/logger";

interface GetProfileRequest {
  userId: string;
  referrerId?: string;
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

function toStatisticType(value: string): statisticsService.StatisticType | null {
  switch (value) {
    case "STATISTIC_TYPE_HANDS_PLAYED":
      return statisticsService.StatisticType.HandsPlayed;
    case "STATISTIC_TYPE_WINS":
      return statisticsService.StatisticType.Wins;
    case "STATISTIC_TYPE_VPIP":
      return statisticsService.StatisticType.Vpip;
    case "STATISTIC_TYPE_PFR":
      return statisticsService.StatisticType.Pfr;
    case "STATISTIC_TYPE_ALL_IN":
      return statisticsService.StatisticType.AllIn;
    case "STATISTIC_TYPE_BIGGEST_POT":
      return statisticsService.StatisticType.BiggestPot;
    case "STATISTIC_TYPE_REFERRAL_COUNT":
      return statisticsService.StatisticType.ReferralCount;
    default:
      return null;
  }
}

export const handlers = {
  GetProfile: async (call: ServerUnaryCall<GetProfileRequest, unknown>, callback: sendUnaryData<unknown>) => {
    const started = Date.now();
    try {
      const profile = await profileService.getProfile(
        call.request.userId,
        normalizeOptionalString(call.request.referrerId)
      );
      recordProfileLookup(profile.deletedAt ? "deleted" : "ok");
      callback(null, { profile: mapProfile(profile) });
      recordGrpcRequest("GetProfile", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "GetProfile failed");
      recordGrpcRequest("GetProfile", "error", Date.now() - started);
      callback(error as Error);
    }
  },

  GetProfiles: async (call: ServerUnaryCall<GetProfilesRequest, unknown>, callback: sendUnaryData<unknown>) => {
    const started = Date.now();
    try {
      const profiles = await profileService.getProfiles(call.request.userIds ?? []);
      callback(null, { profiles: profiles.map(mapProfile) });
      recordGrpcRequest("GetProfiles", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "GetProfiles failed");
      recordGrpcRequest("GetProfiles", "error", Date.now() - started);
      callback(error as Error);
    }
  },

  UpdateProfile: async (call: ServerUnaryCall<UpdateProfileRequest, unknown>, callback: sendUnaryData<unknown>) => {
    const started = Date.now();
    try {
      const nickname = normalizeOptionalString(call.request.nickname);
      const avatarUrlRaw = call.request.avatarUrl;
      const avatarUrl = avatarUrlRaw === "" ? null : normalizeOptionalString(avatarUrlRaw);
      const profile = await profileService.updateProfile(call.request.userId, {
        nickname,
        avatarUrl,
        preferences: call.request.preferences,
      });
      recordProfileUpdate("ok");
      callback(null, { profile: mapProfile(profile) });
      recordGrpcRequest("UpdateProfile", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "UpdateProfile failed");
      recordProfileUpdate("error");
      recordGrpcRequest("UpdateProfile", "error", Date.now() - started);
      callback(error as Error);
    }
  },

  DeleteProfile: async (call: ServerUnaryCall<DeleteProfileRequest, unknown>, callback: sendUnaryData<unknown>) => {
    const started = Date.now();
    try {
      await profileService.deleteProfile(call.request.userId);
      callback(null, { success: true });
      recordGrpcRequest("DeleteProfile", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "DeleteProfile failed");
      recordGrpcRequest("DeleteProfile", "error", Date.now() - started);
      callback(error as Error);
    }
  },

  GetStatistics: async (call: ServerUnaryCall<GetStatisticsRequest, unknown>, callback: sendUnaryData<unknown>) => {
    const started = Date.now();
    try {
      const statistics = await statisticsService.getStatistics(call.request.userId);
      callback(null, { statistics: mapStatistics(statistics) });
      recordGrpcRequest("GetStatistics", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "GetStatistics failed");
      recordGrpcRequest("GetStatistics", "error", Date.now() - started);
      callback(error as Error);
    }
  },

  IncrementStatistic: async (
    call: ServerUnaryCall<IncrementStatisticRequest, unknown>,
    callback: sendUnaryData<unknown>
  ) => {
    const started = Date.now();
    try {
      const type = toStatisticType(call.request.type);
      if (!type) {
        throw new Error("Invalid statistic type");
      }
      const updated = await statisticsService.incrementStatistic(call.request.userId, type, call.request.amount ?? 0);
      recordStatisticsUpdate(type);
      callback(null, mapStatistics(updated));
      recordGrpcRequest("IncrementStatistic", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "IncrementStatistic failed");
      recordGrpcRequest("IncrementStatistic", "error", Date.now() - started);
      callback(error as Error);
    }
  },

  GetFriends: async (call: ServerUnaryCall<GetFriendsRequest, unknown>, callback: sendUnaryData<unknown>) => {
    const started = Date.now();
    try {
      const friends = await friendsService.getFriends(call.request.userId);
      callback(null, { friends: friends.map(mapFriendProfile) });
      recordGrpcRequest("GetFriends", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "GetFriends failed");
      recordGrpcRequest("GetFriends", "error", Date.now() - started);
      callback(error as Error);
    }
  },

  AddFriend: async (call: ServerUnaryCall<AddFriendRequest, unknown>, callback: sendUnaryData<unknown>) => {
    const started = Date.now();
    try {
      await friendsService.addFriend(call.request.userId, call.request.friendId);
      recordFriendMutation("add", "ok");
      callback(null, {});
      recordGrpcRequest("AddFriend", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "AddFriend failed");
      recordFriendMutation("add", "error");
      recordGrpcRequest("AddFriend", "error", Date.now() - started);
      callback(error as Error);
    }
  },

  RemoveFriend: async (call: ServerUnaryCall<RemoveFriendRequest, unknown>, callback: sendUnaryData<unknown>) => {
    const started = Date.now();
    try {
      await friendsService.removeFriend(call.request.userId, call.request.friendId);
      recordFriendMutation("remove", "ok");
      callback(null, {});
      recordGrpcRequest("RemoveFriend", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "RemoveFriend failed");
      recordFriendMutation("remove", "error");
      recordGrpcRequest("RemoveFriend", "error", Date.now() - started);
      callback(error as Error);
    }
  },

  GetNicknames: async (call: ServerUnaryCall<GetNicknamesRequest, unknown>, callback: sendUnaryData<unknown>) => {
    const started = Date.now();
    try {
      const profiles = await profileService.getProfiles(call.request.userIds ?? []);
      const nicknames = profiles.map((profile) => ({
        userId: profile.userId,
        nickname: profile.nickname,
      }));
      callback(null, { nicknames });
      recordGrpcRequest("GetNicknames", "ok", Date.now() - started);
    } catch (error: unknown) {
      logger.error({ err: error }, "GetNicknames failed");
      recordGrpcRequest("GetNicknames", "error", Date.now() - started);
      callback(error as Error);
    }
  },
};
