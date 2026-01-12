import { query } from "../storage/db";
import * as deletionService from "../services/deletionService";
import logger from "../observability/logger";
import { getConfig } from "../config";

let intervalId: NodeJS.Timeout | null = null;

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
    [cutoffDate]
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
        "Hard deleted user profile after grace period"
      );
    } catch (error) {
      logger.error(
        { err: error, userId: profile.user_id },
        "Failed to hard delete user profile"
      );
    }
  }

  return processed;
}

export function startDeletionProcessor(): void {
  const config = getConfig();
  const intervalMs = config.deletionProcessorIntervalMs || 60 * 60 * 1000; // Default: 1 hour

  logger.info({ intervalMs }, "Starting deletion processor job");

  // Run immediately on startup
  processExpiredDeletions().catch((error) => {
    logger.error({ err: error }, "Deletion processor initial run failed");
  });

  intervalId = setInterval(async () => {
    try {
      const deletedCount = await processExpiredDeletions();
      if (deletedCount > 0) {
        logger.info({ deletedCount }, "Processed expired profile deletions");
      }
    } catch (error) {
      logger.error({ err: error }, "Deletion processor job error");
    }
  }, intervalMs);
}

export function stopDeletionProcessor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Stopped deletion processor job");
  }
}
