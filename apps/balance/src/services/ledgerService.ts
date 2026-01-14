import { LedgerEntry } from "../domain/types";
import {
  getLedgerEntries,
  verifyLedgerIntegrity,
  getLatestChecksum,
} from "../storage/ledgerStore";
import logger from "../observability/logger";

export interface LedgerQueryOptions {
  limit?: number;
  from?: string;
  to?: string;
}

export interface LedgerQueryResult {
  entries: LedgerEntry[];
  total: number;
  latestChecksum: string;
}

export interface IntegrityResult {
  valid: boolean;
  entriesChecked: number;
  firstInvalidEntry?: string;
}

export async function queryLedger(
  accountId: string,
  options: LedgerQueryOptions = {}
): Promise<LedgerQueryResult> {
  return getLedgerEntries(accountId, options);
}

export async function verifyAccountLedger(accountId: string): Promise<IntegrityResult> {
  return verifyLedgerIntegrity(accountId);
}

export async function getAccountChecksum(accountId: string): Promise<string> {
  return getLatestChecksum(accountId);
}

// Background job to verify all ledgers
export async function verifyAllLedgers(
  accountIds: string[]
): Promise<{ valid: boolean; results: Record<string, IntegrityResult> }> {
  const results: Record<string, IntegrityResult> = {};
  let allValid = true;

  for (const accountId of accountIds) {
    const result = await verifyLedgerIntegrity(accountId);
    results[accountId] = result;
    if (!result.valid) {
      allValid = false;
      logger.error({
        accountId,
        entriesChecked: result.entriesChecked,
        firstInvalidEntry: result.firstInvalidEntry,
      }, "ledger.integrity.failed");
    }
  }

  return { valid: allValid, results };
}
