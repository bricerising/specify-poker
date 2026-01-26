import { apiFetch } from "./apiClient";
import { asRecord, readStringArray, readTrimmedString, toNumber } from "../utils/unknown";

export interface UserProfile {
  userId: string;
  username: string;
  avatarUrl: string | null;
  stats: {
    handsPlayed: number;
    wins: number;
  };
  friends: string[];
}

function decodeUserProfile(payload: unknown): UserProfile {
  const record = asRecord(payload);
  if (!record) {
    throw new Error("Invalid profile response");
  }

  const userId = readTrimmedString(record.userId ?? record.user_id);
  const username = readTrimmedString(record.username ?? record.nickname);
  if (!userId || !username) {
    throw new Error("Invalid profile response");
  }

  const avatarUrl = readTrimmedString(record.avatarUrl ?? record.avatar_url) ?? null;
  const stats = asRecord(record.stats);
  const handsPlayed = toNumber(stats?.handsPlayed ?? stats?.hands_played, 0);
  const wins = toNumber(stats?.wins, 0);
  const friends = readStringArray(record.friends);

  return {
    userId,
    username,
    avatarUrl,
    stats: {
      handsPlayed,
      wins,
    },
    friends,
  };
}

export async function fetchProfile() {
  const response = await apiFetch("/api/me");
  return decodeUserProfile(await response.json());
}

export async function updateProfile(input: { avatarUrl: string | null }) {
  const response = await apiFetch("/api/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return decodeUserProfile(await response.json());
}
