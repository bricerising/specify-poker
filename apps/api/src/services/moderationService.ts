const mutedByTable = new Map<string, Set<string>>();

export function muteUser(tableId: string, userId: string) {
  const muted = mutedByTable.get(tableId) ?? new Set<string>();
  muted.add(userId);
  mutedByTable.set(tableId, muted);
  return muted;
}

export function isUserMuted(tableId: string, userId: string) {
  return mutedByTable.get(tableId)?.has(userId) ?? false;
}

export function resetModeration() {
  mutedByTable.clear();
}
