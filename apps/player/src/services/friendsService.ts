import { err, ok, type Result } from '@specify-poker/shared';
import type { FriendProfile } from '../domain/types';
import { friendsStore } from '../storage/friendsStore';
import { getProfileSummaries } from './profileService';
import { type AddFriendError } from '../domain/errors';

export async function getFriends(userId: string): Promise<FriendProfile[]> {
  const friendIds = await friendsStore.getFriendIds(userId);

  if (friendIds.length === 0) {
    return [];
  }

  const summaries = await getProfileSummaries(friendIds);
  return summaries.map((summary) => ({
    userId: summary.userId,
    nickname: summary.nickname,
    avatarUrl: summary.avatarUrl,
  }));
}

export async function addFriend(
  userId: string,
  friendId: string,
): Promise<Result<void, AddFriendError>> {
  if (userId === friendId) {
    return err({ type: 'CannotAddSelf' });
  }
  await friendsStore.addFriend(userId, friendId);
  return ok(undefined);
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  await friendsStore.removeFriend(userId, friendId);
}
