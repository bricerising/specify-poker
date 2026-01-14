export type ThemePreference = "light" | "dark" | "auto";

export interface UserPreferences {
  soundEnabled: boolean;
  chatEnabled: boolean;
  showHandStrength: boolean;
  theme: ThemePreference;
}

export interface Profile {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  preferences: UserPreferences;
  lastLoginAt: string | null;
  referredBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Statistics {
  userId: string;
  handsPlayed: number;
  wins: number;
  vpip: number;
  pfr: number;
  allInCount: number;
  biggestPot: number;
  referralCount: number;
  lastUpdated: string;
}

export interface FriendsList {
  userId: string;
  friendIds: string[];
  updatedAt: string;
}

export interface ProfileSummary {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface FriendProfile {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  status?: "online" | "offline";
}
