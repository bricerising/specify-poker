import { verifyAllLedgers } from "../services/ledgerService";
import { listAccounts } from "../storage/accountStore";
import { getConfig } from "../config";
import logger from "../observability/logger";

let intervalId: NodeJS.Timeout | null = null;

export function startLedgerVerificationJob(): void {
  const config = getConfig();
  const intervalMs = config.ledgerVerificationIntervalMs;

  logger.info({ intervalMs }, "Starting ledger verification job");

  intervalId = setInterval(async () => {
    try {
      const accounts = await listAccounts();
      const accountIds = accounts.map((a) => a.accountId);

      if (accountIds.length === 0) {
        return;
      }

      const result = await verifyAllLedgers(accountIds);

      if (!result.valid) {
        logger.error({
          failedAccounts: Object.entries(result.results)
            .filter(([, r]) => !r.valid)
            .map(([id, r]) => ({
              accountId: id,
              firstInvalidEntry: r.firstInvalidEntry,
            })),
        }, "Ledger integrity check failed");
      }
    } catch (error) {
      logger.error({ err: error }, "Ledger verification job error");
    }
  }, intervalMs);
}

export function stopLedgerVerificationJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
