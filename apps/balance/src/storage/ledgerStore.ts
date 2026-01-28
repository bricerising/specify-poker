import { createHash } from 'crypto';
import type { LedgerEntry } from '../domain/types';
import logger from '../observability/logger';
import { tryJsonParse } from '../utils/json';
import { getRedisClient } from './redisClient';

const LEDGER_PREFIX = 'balance:ledger:';
const LEDGER_CHECKSUM_PREFIX = 'balance:ledger:latest-checksum:';
const LEDGER_GLOBAL_KEY = 'balance:ledger:global';

// In-memory cache
const ledgerByAccount = new Map<string, LedgerEntry[]>();
const latestChecksums = new Map<string, string>();

function computeChecksum(entry: Omit<LedgerEntry, 'checksum'>, previousChecksum: string): string {
  const data = JSON.stringify({
    entryId: entry.entryId,
    transactionId: entry.transactionId,
    accountId: entry.accountId,
    type: entry.type,
    amount: entry.amount,
    balanceBefore: entry.balanceBefore,
    balanceAfter: entry.balanceAfter,
    metadata: entry.metadata,
    timestamp: entry.timestamp,
    previousChecksum,
  });
  return createHash('sha256').update(data).digest('hex');
}

export async function getLatestChecksum(accountId: string): Promise<string> {
  const cached = latestChecksums.get(accountId);
  if (cached) {
    return cached;
  }

  const redis = await getRedisClient();
  if (redis) {
    const checksum = await redis.get(`${LEDGER_CHECKSUM_PREFIX}${accountId}`);
    if (checksum) {
      latestChecksums.set(accountId, checksum);
      return checksum;
    }
  }

  return 'GENESIS';
}

export async function appendLedgerEntry(
  entry: Omit<LedgerEntry, 'checksum' | 'previousChecksum'>,
): Promise<LedgerEntry> {
  const previousChecksum = await getLatestChecksum(entry.accountId);
  const checksum = computeChecksum({ ...entry, previousChecksum }, previousChecksum);

  const fullEntry: LedgerEntry = {
    ...entry,
    previousChecksum,
    checksum,
  };

  // Update cache
  let accountLedger = ledgerByAccount.get(entry.accountId);
  if (!accountLedger) {
    accountLedger = [];
    ledgerByAccount.set(entry.accountId, accountLedger);
  }
  accountLedger.push(fullEntry);
  latestChecksums.set(entry.accountId, checksum);

  // Persist to Redis
  const redis = await getRedisClient();
  if (redis) {
    await redis.rPush(`${LEDGER_PREFIX}${entry.accountId}`, JSON.stringify(fullEntry));
    await redis.set(`${LEDGER_CHECKSUM_PREFIX}${entry.accountId}`, checksum);
    await redis.zAdd(LEDGER_GLOBAL_KEY, {
      score: new Date(entry.timestamp).getTime(),
      value: JSON.stringify({ entryId: entry.entryId, accountId: entry.accountId }),
    });
  }

  return fullEntry;
}

export async function getLedgerEntries(
  accountId: string,
  options: { limit?: number; from?: string; to?: string } = {},
): Promise<{ entries: LedgerEntry[]; total: number; latestChecksum: string }> {
  const { limit = 50, from, to } = options;

  const redis = await getRedisClient();
  if (redis) {
    const total = await redis.lLen(`${LEDGER_PREFIX}${accountId}`);
    const rawEntries = await redis.lRange(`${LEDGER_PREFIX}${accountId}`, -limit, -1);

    const parsedEntries: LedgerEntry[] = [];
    for (const raw of rawEntries) {
      const parsed = tryJsonParse<LedgerEntry>(raw);
      if (!parsed.ok) {
        logger.warn({ err: parsed.error, accountId }, 'ledgerStore.parse.failed');
        continue;
      }
      parsedEntries.push(parsed.value);
    }

    let entries = parsedEntries.reverse();

    // Filter by time range if specified
    if (from) {
      const fromTime = new Date(from).getTime();
      entries = entries.filter((e) => new Date(e.timestamp).getTime() >= fromTime);
    }
    if (to) {
      const toTime = new Date(to).getTime();
      entries = entries.filter((e) => new Date(e.timestamp).getTime() <= toTime);
    }

    const latestChecksum = await getLatestChecksum(accountId);

    return { entries, total, latestChecksum };
  }

  // Fallback to in-memory
  let entries = ledgerByAccount.get(accountId) ?? [];

  if (from) {
    const fromTime = new Date(from).getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= fromTime);
  }
  if (to) {
    const toTime = new Date(to).getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() <= toTime);
  }

  const latestChecksum = await getLatestChecksum(accountId);

  return {
    entries: entries.slice(-limit).reverse(),
    total: entries.length,
    latestChecksum,
  };
}

export async function verifyLedgerIntegrity(accountId: string): Promise<{
  valid: boolean;
  entriesChecked: number;
  firstInvalidEntry?: string;
}> {
  const redis = await getRedisClient();
  let entries: LedgerEntry[] = [];

  if (redis) {
    const rawEntries = await redis.lRange(`${LEDGER_PREFIX}${accountId}`, 0, -1);
    for (let i = 0; i < rawEntries.length; i++) {
      const raw = rawEntries[i];
      const parsed = tryJsonParse<LedgerEntry>(raw);
      if (!parsed.ok) {
        logger.error({ err: parsed.error, accountId, index: i }, 'ledgerStore.parse.failed');
        return { valid: false, entriesChecked: i, firstInvalidEntry: 'PARSE_FAILED' };
      }
      entries.push(parsed.value);
    }
  } else {
    entries = ledgerByAccount.get(accountId) ?? [];
  }

  if (entries.length === 0) {
    return { valid: true, entriesChecked: 0 };
  }

  let previousChecksum = 'GENESIS';
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.previousChecksum !== previousChecksum) {
      return {
        valid: false,
        entriesChecked: i,
        firstInvalidEntry: entry.entryId,
      };
    }

    const expectedChecksum = computeChecksum(
      {
        entryId: entry.entryId,
        transactionId: entry.transactionId,
        accountId: entry.accountId,
        type: entry.type,
        amount: entry.amount,
        balanceBefore: entry.balanceBefore,
        balanceAfter: entry.balanceAfter,
        metadata: entry.metadata,
        timestamp: entry.timestamp,
        previousChecksum: entry.previousChecksum,
      },
      previousChecksum,
    );

    if (entry.checksum !== expectedChecksum) {
      return {
        valid: false,
        entriesChecked: i,
        firstInvalidEntry: entry.entryId,
      };
    }

    previousChecksum = entry.checksum;
  }

  return { valid: true, entriesChecked: entries.length };
}

export async function resetLedger(): Promise<void> {
  ledgerByAccount.clear();
  latestChecksums.clear();

  const redis = await getRedisClient();
  if (redis) {
    await redis.del(LEDGER_GLOBAL_KEY);
    // Note: Would need to track all account keys to delete them
  }
}
