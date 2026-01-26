import { apiFetch } from "./apiClient";
import { asRecord, readStringArray } from "../utils/unknown";

function decodeFriendsResponse(payload: unknown): string[] {
  const record = asRecord(payload);
  if (!record) {
    throw new Error("Invalid friends response");
  }
  if (!Array.isArray(record.friends)) {
    throw new Error("Invalid friends response");
  }
  return readStringArray(record.friends);
}

export async function fetchFriends() {
  const response = await apiFetch("/api/friends");
  return decodeFriendsResponse(await response.json());
}

export async function updateFriends(friends: string[]) {
  const response = await apiFetch("/api/friends", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ friends }),
  });
  return decodeFriendsResponse(await response.json());
}
