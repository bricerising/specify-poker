import { randomUUID } from "crypto";
import { Account } from "../domain/types";
import { getRedisClient } from "./redisClient";

const ACCOUNTS_KEY = "balance:accounts";
const ACCOUNTS_IDS_KEY = "balance:accounts:ids";

// In-memory cache
const accounts = new Map<string, Account>();

function now(): string {
  return new Date().toISOString();
}

export async function getAccount(accountId: string): Promise<Account | null> {
  // Check cache first
  const cached = accounts.get(accountId);
  if (cached) {
    return cached;
  }

  // Try Redis
  const redis = await getRedisClient();
  if (redis) {
    const payload = await redis.hGet(ACCOUNTS_KEY, accountId);
    if (payload) {
      const account = JSON.parse(payload) as Account;
      accounts.set(accountId, account);
      return account;
    }
  }

  return null;
}

export async function ensureAccount(
  accountId: string,
  initialBalance: number = 0
): Promise<{ account: Account; created: boolean }> {
  const existing = await getAccount(accountId);
  if (existing) {
    return { account: existing, created: false };
  }

  const account: Account = {
    accountId,
    balance: initialBalance,
    currency: "CHIPS",
    version: 0,
    createdAt: now(),
    updatedAt: now(),
  };

  accounts.set(accountId, account);

  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(ACCOUNTS_KEY, accountId, JSON.stringify(account));
    await redis.sAdd(ACCOUNTS_IDS_KEY, accountId);
  }

  return { account, created: true };
}

export async function updateAccount(
  accountId: string,
  updater: (current: Account) => Account
): Promise<Account | null> {
  const current = await getAccount(accountId);
  if (!current) {
    return null;
  }

  const updated = updater(current);
  updated.version = current.version + 1;
  updated.updatedAt = now();

  accounts.set(accountId, updated);

  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(ACCOUNTS_KEY, accountId, JSON.stringify(updated));
  }

  return updated;
}

export async function updateAccountWithVersion(
  accountId: string,
  expectedVersion: number,
  updater: (current: Account) => Account
): Promise<{ ok: boolean; account?: Account; error?: string }> {
  const current = await getAccount(accountId);
  if (!current) {
    return { ok: false, error: "ACCOUNT_NOT_FOUND" };
  }

  if (current.version !== expectedVersion) {
    return { ok: false, error: "VERSION_CONFLICT" };
  }

  const updated = await updateAccount(accountId, updater);
  if (!updated) {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  return { ok: true, account: updated };
}

export async function listAccounts(): Promise<Account[]> {
  const redis = await getRedisClient();
  if (redis) {
    const accountIds = await redis.sMembers(ACCOUNTS_IDS_KEY);
    const result: Account[] = [];
    for (const id of accountIds) {
      const account = await getAccount(id);
      if (account) {
        result.push(account);
      }
    }
    return result;
  }
  return Array.from(accounts.values());
}

export async function resetAccounts(): Promise<void> {
  accounts.clear();
  const redis = await getRedisClient();
  if (redis) {
    await redis.del(ACCOUNTS_KEY);
    await redis.del(ACCOUNTS_IDS_KEY);
  }
}
