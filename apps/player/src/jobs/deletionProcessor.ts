import { createPeriodicTask, type PeriodicTask } from '@specify-poker/shared';

import { query } from '../storage/db';
import * as deletionService from '../services/deletionService';
import logger from '../observability/logger';
import { getConfig } from '../config';

let task: PeriodicTask | null = null;

const DELETION_GRACE_DAYS = 30;

interface DeletedProfile {
  user_id: string;
  deleted_at: Date;
}

async function getExpiredDeletions(): Promise<DeletedProfile[]> {
  const gracePeriodMs = DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(Date.now() - gracePeriodMs);

  const result = await query<DeletedProfile>(
    `SELECT user_id, deleted_at FROM profiles
     WHERE deleted_at IS NOT NULL
       AND deleted_at < $1`,
    [cutoffDate],
  );

  return result.rows;
}

async function processExpiredDeletions(): Promise<number> {
  const expired = await getExpiredDeletions();

  if (expired.length === 0) {
    return 0;
  }

  let processed = 0;

  for (const profile of expired) {
    try {
      await deletionService.hardDelete(profile.user_id);
      processed += 1;
      logger.info(
        { userId: profile.user_id, deletedAt: profile.deleted_at },
        'Hard deleted user profile after grace period',
      );
    } catch (error) {
      logger.error({ err: error, userId: profile.user_id }, 'Failed to hard delete user profile');
    }
  }

  return processed;
}

export function startDeletionProcessor(): void {
  const config = getConfig();
  const intervalMs = config.deletionProcessorIntervalMs;

  task?.stop();

  if (intervalMs <= 0) {
    task = null;
    logger.info({ intervalMs }, 'Deletion processor disabled');
    return;
  }

  logger.info({ intervalMs }, 'Starting deletion processor job');

  let isFirstRun = true;

  task = createPeriodicTask({
    name: 'player.deletion_processor',
    intervalMs,
    runOnStart: true,
    logger,
    run: async () => {
      try {
        const deletedCount = await processExpiredDeletions();
        if (deletedCount > 0) {
          logger.info({ deletedCount }, 'Processed expired profile deletions');
        }
      } catch (error) {
        logger.error(
          { err: error },
          isFirstRun ? 'Deletion processor initial run failed' : 'Deletion processor job error',
        );
      } finally {
        isFirstRun = false;
      }
    },
  });

  task.start();
}

export function stopDeletionProcessor(): void {
  if (!task) {
    return;
  }

  task.stop();
  task = null;
  logger.info('Stopped deletion processor job');
}
