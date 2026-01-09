const friendsByUser = new Map<string, string[]>();

export function getFriends(userId: string) {
  return friendsByUser.get(userId) ?? [];
}

export function setFriends(userId: string, friends: string[]) {
  const unique = Array.from(new Set(friends));
  friendsByUser.set(userId, unique);
  return unique;
}

export function resetFriends() {
  friendsByUser.clear();
}
