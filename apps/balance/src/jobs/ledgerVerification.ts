import { verifyAllLedgers } from "../services/ledgerService";
import { listAccounts } from "../storage/accountStore";
import { getConfig } from "../config";

let intervalId: NodeJS.Timeout | null = null;

export function startLedgerVerificationJob(): void {
  const config = getConfig();
  const intervalMs = config.ledgerVerificationIntervalMs;

  console.log(`Starting ledger verification job (interval: ${intervalMs}ms)`);

  intervalId = setInterval(async () => {
    try {
      const accounts = await listAccounts();
      const accountIds = accounts.map((a) => a.accountId);

      if (accountIds.length === 0) {
        return;
      }

      const result = await verifyAllLedgers(accountIds);

      if (!result.valid) {
        console.error("Ledger integrity check failed!", {
          failedAccounts: Object.entries(result.results)
            .filter(([_, r]) => !r.valid)
            .map(([id, r]) => ({
              accountId: id,
              firstInvalidEntry: r.firstInvalidEntry,
            })),
        });
      }
    } catch (error) {
      console.error("Ledger verification job error:", error);
    }
  }, intervalMs);
}

export function stopLedgerVerificationJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
