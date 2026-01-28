import * as profileRepository from '../storage/profileRepository';
import * as friendsRepository from '../storage/friendsRepository';
import * as profileCache from '../storage/profileCache';
import * as friendsCache from '../storage/friendsCache';
import * as statisticsCache from '../storage/statisticsCache';
import * as deletedCache from '../storage/deletedCache';
import * as statisticsRepository from '../storage/statisticsRepository';

export async function requestDeletion(userId: string): Promise<void> {
  const existing = await profileRepository.findById(userId, true);
  const friendIds = await friendsRepository.getFriends(userId);

  await profileRepository.softDelete(userId, new Date());
  await friendsRepository.removeAllReferences(userId);

  const stats = await statisticsRepository.findById(userId);
  if (stats) {
    await statisticsRepository.update({
      ...stats,
      handsPlayed: 0,
      wins: 0,
      vpip: 0,
      pfr: 0,
      allInCount: 0,
      biggestPot: 0,
      referralCount: 0,
      lastUpdated: new Date().toISOString(),
    });
  }

  if (existing?.nickname) {
    await profileCache.deleteNickname(existing.nickname);
  }

  await profileCache.invalidate(userId);
  await friendsCache.invalidate(userId);
  await statisticsCache.invalidate(userId);
  await deletedCache.markDeleted(userId);

  for (const friendId of friendIds) {
    await friendsCache.invalidate(friendId);
  }
}

export async function hardDelete(userId: string): Promise<void> {
  await friendsRepository.removeAllReferences(userId);
  await profileRepository.hardDelete(userId);
  await profileCache.invalidate(userId);
  await friendsCache.invalidate(userId);
  await statisticsCache.invalidate(userId);
  await deletedCache.clearDeleted(userId);
}
