import type { Transaction } from '../domain/types';
import logger from '../observability/logger';
import { tryJsonParse } from '../utils/json';
import { getRedisClient } from './redisClient';

const TRANSACTIONS_KEY = 'balance:transactions';
const TRANSACTIONS_BY_ACCOUNT_PREFIX = 'balance:transactions:by-account:';

// In-memory cache
const transactions = new Map<string, Transaction>();
const transactionsByAccount = new Map<string, string[]>();

export async function getTransaction(transactionId: string): Promise<Transaction | null> {
  const cached = transactions.get(transactionId);
  if (cached) {
    return cached;
  }

  const redis = await getRedisClient();
  if (redis) {
    const payload = await redis.hGet(TRANSACTIONS_KEY, transactionId);
    if (payload) {
      const parsed = tryJsonParse<Transaction>(payload);
      if (!parsed.ok) {
        logger.warn({ err: parsed.error, transactionId }, 'transactionStore.parse.failed');
        return null;
      }
      const tx = parsed.value;
      transactions.set(transactionId, tx);
      return tx;
    }
  }

  return null;
}

export async function saveTransaction(tx: Transaction): Promise<void> {
  transactions.set(tx.transactionId, tx);

  // Update by-account index
  const accountTxs = transactionsByAccount.get(tx.accountId) ?? [];
  if (!accountTxs.includes(tx.transactionId)) {
    accountTxs.push(tx.transactionId);
    transactionsByAccount.set(tx.accountId, accountTxs);
  }

  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(TRANSACTIONS_KEY, tx.transactionId, JSON.stringify(tx));
    await redis.zAdd(`${TRANSACTIONS_BY_ACCOUNT_PREFIX}${tx.accountId}`, {
      score: new Date(tx.createdAt).getTime(),
      value: tx.transactionId,
    });
  }
}

export async function updateTransaction(
  transactionId: string,
  updater: (current: Transaction) => Transaction,
): Promise<Transaction | null> {
  const current = await getTransaction(transactionId);
  if (!current) {
    return null;
  }

  const updated = updater(current);
  transactions.set(transactionId, updated);

  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(TRANSACTIONS_KEY, transactionId, JSON.stringify(updated));
  }

  return updated;
}

export async function getTransactionsByAccount(
  accountId: string,
  options: { limit?: number; offset?: number; type?: string } = {},
): Promise<{ transactions: Transaction[]; total: number }> {
  const { limit = 50, offset = 0, type } = options;

  const redis = await getRedisClient();
  if (redis) {
    const key = `${TRANSACTIONS_BY_ACCOUNT_PREFIX}${accountId}`;
    const totalInAccount = await redis.zCard(key);
    if (totalInAccount === 0) {
      return { transactions: [], total: 0 };
    }

    if (!type) {
      const txIds = await redis.zRange(key, offset, offset + limit - 1, { REV: true });
      const txs = await Promise.all(txIds.map((txId) => getTransaction(txId)));
      return { transactions: txs.filter((tx): tx is Transaction => tx !== null), total: totalInAccount };
    }

    const page: Transaction[] = [];
    let totalMatching = 0;
    const batchSize = 200;

    for (let start = 0; start < totalInAccount; start += batchSize) {
      const txIds = await redis.zRange(key, start, start + batchSize - 1, { REV: true });
      if (txIds.length === 0) {
        break;
      }

      const txs = await Promise.all(txIds.map((txId) => getTransaction(txId)));
      for (const tx of txs) {
        if (!tx || tx.type !== type) {
          continue;
        }

        if (totalMatching >= offset && page.length < limit) {
          page.push(tx);
        }
        totalMatching += 1;
      }
    }

    return { transactions: page, total: totalMatching };
  }

  // Fallback to in-memory
  const accountTxIds = transactionsByAccount.get(accountId) ?? [];
  const allTxs = await Promise.all(accountTxIds.map((id) => getTransaction(id)));
  let filtered = allTxs.filter((tx): tx is Transaction => tx !== null);

  if (type) {
    filtered = filtered.filter((tx) => tx.type === type);
  }

  // Sort by createdAt descending
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    transactions: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

export async function resetTransactions(): Promise<void> {
  transactions.clear();
  transactionsByAccount.clear();

  const redis = await getRedisClient();
  if (redis) {
    await redis.del(TRANSACTIONS_KEY);
    // Note: Would need to track all account keys to delete them
  }
}
