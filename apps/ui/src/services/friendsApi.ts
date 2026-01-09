import { apiFetch } from "./apiClient";

export async function fetchFriends() {
  const response = await apiFetch("/api/friends");
  const payload = (await response.json()) as { friends: string[] };
  return payload.friends;
}

export async function updateFriends(friends: string[]) {
  const response = await apiFetch("/api/friends", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ friends }),
  });
  const payload = (await response.json()) as { friends: string[] };
  return payload.friends;
}
