import type { PoolClient } from 'pg';
import type { Profile, Statistics } from '../domain/types';
import { transaction } from '../storage/db';
import * as profileRepository from '../storage/profileRepository';
import * as friendsRepository from '../storage/friendsRepository';
import * as profileCache from '../storage/profileCache';
import * as friendsCache from '../storage/friendsCache';
import * as statisticsCache from '../storage/statisticsCache';
import * as deletedCache from '../storage/deletedCache';
import * as statisticsRepository from '../storage/statisticsRepository';

type Command<TContext> = {
  name: string;
  execute(context: TContext): Promise<void>;
};

async function runCommands<TContext>(
  context: TContext,
  commands: readonly Command<TContext>[],
): Promise<void> {
  for (const command of commands) {
    try {
      await command.execute(context);
    } catch (error) {
      throw new Error(`player.deletionService.command_failed:${command.name}`, { cause: error });
    }
  }
}

type RequestDeletionTxContext = {
  client: PoolClient;
  userId: string;
  deletedAt: Date;
  profile: Profile | null;
  outgoingFriendIds: string[];
  incomingFriendUserIds: string[];
  statistics: Statistics | null;
};

type RequestDeletionResult = {
  existingNickname: string | null;
  affectedFriendsCacheUserIds: string[];
};

function createLoadRequestDeletionStateCommand(): Command<RequestDeletionTxContext> {
  return {
    name: 'tx.load_state',
    execute: async (context) => {
      const { client, userId } = context;

      const [profile, outgoingFriendIds, incomingFriendUserIds, statistics] = await Promise.all([
        profileRepository.findById(userId, true, client),
        friendsRepository.getFriends(userId, client),
        friendsRepository.getUsersWithFriend(userId, client),
        statisticsRepository.findById(userId, client),
      ]);

      context.profile = profile;
      context.outgoingFriendIds = outgoingFriendIds;
      context.incomingFriendUserIds = incomingFriendUserIds;
      context.statistics = statistics;
    },
  };
}

function createSoftDeleteProfileCommand(): Command<RequestDeletionTxContext> {
  return {
    name: 'tx.soft_delete_profile',
    execute: async ({ client, userId, deletedAt }) => {
      await profileRepository.softDelete(userId, deletedAt, client);
    },
  };
}

function createRemoveFriendReferencesCommand(): Command<RequestDeletionTxContext> {
  return {
    name: 'tx.remove_friend_refs',
    execute: async ({ client, userId }) => {
      await friendsRepository.removeAllReferences(userId, client);
    },
  };
}

function createResetStatisticsCommand(): Command<RequestDeletionTxContext> {
  return {
    name: 'tx.reset_statistics',
    execute: async (context) => {
      if (!context.statistics) {
        return;
      }

      const nowIso = context.deletedAt.toISOString();
      await statisticsRepository.update(
        {
          ...context.statistics,
          handsPlayed: 0,
          wins: 0,
          vpip: 0,
          pfr: 0,
          allInCount: 0,
          biggestPot: 0,
          referralCount: 0,
          lastUpdated: nowIso,
        },
        context.client,
      );
    },
  };
}

async function runRequestDeletionTransaction(
  userId: string,
  deletedAt: Date,
): Promise<RequestDeletionResult> {
  return transaction(async (client) => {
    const context: RequestDeletionTxContext = {
      client,
      userId,
      deletedAt,
      profile: null,
      outgoingFriendIds: [],
      incomingFriendUserIds: [],
      statistics: null,
    };

    const commands: readonly Command<RequestDeletionTxContext>[] = [
      createLoadRequestDeletionStateCommand(),
      createSoftDeleteProfileCommand(),
      createRemoveFriendReferencesCommand(),
      createResetStatisticsCommand(),
    ];

    await runCommands(context, commands);

    const affectedFriendsCacheUserIds = Array.from(
      new Set([...context.outgoingFriendIds, ...context.incomingFriendUserIds]),
    );

    return {
      existingNickname: context.profile?.nickname ?? null,
      affectedFriendsCacheUserIds,
    };
  });
}

export async function requestDeletion(userId: string): Promise<void> {
  const deletedAt = new Date();
  const { existingNickname, affectedFriendsCacheUserIds } = await runRequestDeletionTransaction(
    userId,
    deletedAt,
  );

  if (existingNickname) {
    await profileCache.deleteNickname(existingNickname);
  }

  await Promise.all([
    profileCache.invalidate(userId),
    friendsCache.invalidate(userId),
    statisticsCache.invalidate(userId),
    deletedCache.markDeleted(userId),
  ]);

  const otherUserIds = affectedFriendsCacheUserIds.filter((id) => id !== userId);
  await Promise.all(otherUserIds.map((id) => friendsCache.invalidate(id)));
}

export async function hardDelete(userId: string): Promise<void> {
  await transaction(async (client) => {
    const commands: readonly Command<{ client: PoolClient; userId: string }>[] = [
      {
        name: 'tx.remove_friend_refs',
        execute: async ({ client, userId }) => {
          await friendsRepository.removeAllReferences(userId, client);
        },
      },
      {
        name: 'tx.hard_delete_profile',
        execute: async ({ client, userId }) => {
          await profileRepository.hardDelete(userId, client);
        },
      },
    ];

    await runCommands({ client, userId }, commands);
  });

  await Promise.all([
    profileCache.invalidate(userId),
    friendsCache.invalidate(userId),
    statisticsCache.invalidate(userId),
    deletedCache.clearDeleted(userId),
  ]);
}
