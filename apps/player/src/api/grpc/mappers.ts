import type { FriendProfile, Profile, Statistics } from '../../domain/types';

export function toGrpcProfile(profile: Profile) {
  return {
    userId: profile.userId,
    username: profile.username,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl ?? '',
    preferences: {
      soundEnabled: profile.preferences.soundEnabled,
      chatEnabled: profile.preferences.chatEnabled,
      showHandStrength: profile.preferences.showHandStrength,
      theme: profile.preferences.theme,
    },
    lastLoginAt: profile.lastLoginAt ?? '',
    referredBy: profile.referredBy ?? '',
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function toGrpcStatistics(stats: Statistics) {
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

export function toGrpcFriendProfile(friend: FriendProfile) {
  return {
    userId: friend.userId,
    nickname: friend.nickname,
    avatarUrl: friend.avatarUrl ?? '',
    status: friend.status ?? '',
  };
}
