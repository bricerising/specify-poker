import { apiFetch } from "./apiClient";

export interface UserProfile {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  stats: {
    handsPlayed: number;
    wins: number;
  };
  friends: string[];
}

export async function fetchProfile() {
  const response = await apiFetch("/api/me");
  return (await response.json()) as UserProfile;
}

export async function updateProfile(input: { nickname: string; avatarUrl: string | null }) {
  const response = await apiFetch("/api/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await response.json()) as UserProfile;
}
