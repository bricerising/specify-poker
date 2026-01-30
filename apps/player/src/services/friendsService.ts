import type { FriendProfile } from '../domain/types';
import { friendsStore } from '../storage/friendsStore';
import { getProfileSummaries } from './profileService';
import { ValidationError } from '../domain/errors';

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

export async function addFriend(userId: string, friendId: string): Promise<void> {
  if (userId === friendId) {
    throw new ValidationError('Cannot add yourself as a friend');
  }
  await friendsStore.addFriend(userId, friendId);
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  await friendsStore.removeFriend(userId, friendId);
}
