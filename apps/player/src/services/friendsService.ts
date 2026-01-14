import { FriendProfile } from "../domain/types";
import * as friendsRepository from "../storage/friendsRepository";
import * as friendsCache from "../storage/friendsCache";
import { getProfileSummaries } from "./profileService";

export async function getFriends(userId: string): Promise<FriendProfile[]> {
  const cached = await friendsCache.get(userId);
  const friendIds = cached ?? (await friendsRepository.getFriends(userId));
  if (!cached) {
    await friendsCache.set(userId, friendIds);
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
    throw new Error("Cannot add yourself as a friend");
  }
  await friendsRepository.addFriend(userId, friendId);
  await friendsCache.add(userId, friendId);
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  await friendsRepository.removeFriend(userId, friendId);
  await friendsCache.remove(userId, friendId);
}
