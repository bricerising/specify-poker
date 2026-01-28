import redisClient from './redisClient';

const MUTE_PREFIX = 'game:mutes:';

export class MuteStore {
  async mute(tableId: string, userId: string): Promise<void> {
    await redisClient.sAdd(`${MUTE_PREFIX}${tableId}`, userId);
  }

  async unmute(tableId: string, userId: string): Promise<void> {
    await redisClient.sRem(`${MUTE_PREFIX}${tableId}`, userId);
  }

  async isMuted(tableId: string, userId: string): Promise<boolean> {
    return await redisClient.sIsMember(`${MUTE_PREFIX}${tableId}`, userId);
  }

  async list(tableId: string): Promise<string[]> {
    return await redisClient.sMembers(`${MUTE_PREFIX}${tableId}`);
  }
}

export const muteStore = new MuteStore();
