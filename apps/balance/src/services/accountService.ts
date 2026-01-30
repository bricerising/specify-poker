import { randomUUID } from 'crypto';
import {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type Account,
  type BalanceInfo,
  type CashOutResult,
  type Transaction,
  type TransactionMetadata,
  type TransactionStatus,
  type TransactionType,
} from '../domain/types';
import { ACCOUNT_ERROR_CODES, type AccountErrorCode } from '../domain/errors';
import { err, ok, type Result } from '../domain/result';
import { nowIso } from '../utils/time';
import {
  ensureAccount as storeEnsureAccount,
  getAccount,
  withAccountLock,
  updateAccountWithVersion,
} from '../storage/accountStore';
import { saveTransaction } from '../storage/transactionStore';
import { appendLedgerEntry } from '../storage/ledgerStore';
import { getActiveReservationsByAccount } from '../storage/reservationStore';
import { recordAccountDelta } from '../observability/metrics';
import { getCachedIdempotentResponse, withIdempotentResponse } from '../utils/idempotency';
import { asFiniteNumber, asString, isRecord } from '../utils/guards';

type TransactionResult = Result<Transaction, AccountErrorCode>;

const ACCOUNT_ERROR_CODE_SET: ReadonlySet<AccountErrorCode> = new Set(ACCOUNT_ERROR_CODES);
const TRANSACTION_STATUS_SET: ReadonlySet<TransactionStatus> = new Set(TRANSACTION_STATUSES);
const TRANSACTION_TYPE_SET: ReadonlySet<TransactionType> = new Set(TRANSACTION_TYPES);

function asAccountErrorCode(value: unknown): AccountErrorCode | null {
  return typeof value === 'string' && ACCOUNT_ERROR_CODE_SET.has(value as AccountErrorCode)
    ? (value as AccountErrorCode)
    : null;
}

function asTransactionType(value: unknown): TransactionType | null {
  return typeof value === 'string' && TRANSACTION_TYPE_SET.has(value as TransactionType)
    ? (value as TransactionType)
    : null;
}

function asTransactionStatus(value: unknown): TransactionStatus | null {
  return typeof value === 'string' && TRANSACTION_STATUS_SET.has(value as TransactionStatus)
    ? (value as TransactionStatus)
    : null;
}

function parseTransaction(value: unknown): Transaction | null {
  if (!isRecord(value)) {
    return null;
  }

  const transactionId = asString(value.transactionId);
  const idempotencyKey = asString(value.idempotencyKey);
  const type = asTransactionType(value.type);
  const accountId = asString(value.accountId);
  const amount = asFiniteNumber(value.amount);
  const balanceBefore = asFiniteNumber(value.balanceBefore);
  const balanceAfter = asFiniteNumber(value.balanceAfter);
  const metadata = isRecord(value.metadata) ? (value.metadata as TransactionMetadata) : {};
  const status = value.status === undefined ? 'COMPLETED' : asTransactionStatus(value.status);
  const createdAt = asString(value.createdAt);
  const completedAt =
    value.completedAt === undefined || value.completedAt === null
      ? null
      : asString(value.completedAt);

  if (
    !transactionId ||
    !idempotencyKey ||
    type === null ||
    !accountId ||
    amount === null ||
    balanceBefore === null ||
    balanceAfter === null ||
    !createdAt ||
    status === null ||
    (value.completedAt !== undefined && value.completedAt !== null && completedAt === null)
  ) {
    return null;
  }

  return {
    transactionId,
    idempotencyKey,
    type,
    accountId,
    amount,
    balanceBefore,
    balanceAfter,
    metadata,
    status,
    createdAt,
    completedAt,
  };
}

function decodeTransactionResult(cached: unknown): TransactionResult | null {
  if (!isRecord(cached)) {
    return null;
  }

  if (cached.ok === true) {
    const value = cached.value ?? cached.transaction; // backward compatibility
    const transaction = parseTransaction(value);
    if (!transaction) {
      return null;
    }
    return ok(transaction);
  }

  if (cached.ok === false) {
    const error = asAccountErrorCode(cached.error);
    if (!error) {
      return null;
    }
    return err(error);
  }

  return null;
}

async function getReservedAmount(accountId: string): Promise<number> {
  const activeReservations = await getActiveReservationsByAccount(accountId);
  return activeReservations.reduce((sum, r) => sum + r.amount, 0);
}

async function updateBalanceWithRetry(
  accountId: string,
  updater: (current: Account) => Account,
  options: {
    maxRetries?: number;
    validate?: (current: Account) => Promise<AccountErrorCode | null>;
  } = {},
): Promise<Result<Account, AccountErrorCode>> {
  const { maxRetries = 10, validate } = options;
  let current = await getAccount(accountId);
  if (!current) {
    return err('ACCOUNT_NOT_FOUND');
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (validate) {
      const error = await validate(current);
      if (error) {
        return err(error);
      }
    }

    const updated = await updateAccountWithVersion(accountId, current.version, updater);
    if (updated.ok) {
      return ok(updated.value);
    }
    if (updated.error !== 'VERSION_CONFLICT') {
      return err(updated.error ?? 'UPDATE_FAILED');
    }
    current = await getAccount(accountId);
    if (!current) {
      return err('ACCOUNT_NOT_FOUND');
    }
  }

  return err('VERSION_CONFLICT');
}

function resolveDepositType(source: string): TransactionType {
  const normalized = source.trim().toUpperCase();
  if (normalized === 'BONUS') return 'BONUS';
  if (normalized === 'REFERRAL') return 'REFERRAL';
  return 'DEPOSIT';
}

export async function getBalance(accountId: string): Promise<BalanceInfo | null> {
  const account = await getAccount(accountId);
  if (!account) {
    return null;
  }

  const reservedAmount = await getReservedAmount(accountId);

  return {
    accountId: account.accountId,
    balance: account.balance,
    availableBalance: account.balance - reservedAmount,
    currency: account.currency,
    version: account.version,
  };
}

export async function ensureAccount(
  accountId: string,
  initialBalance: number = 0,
): Promise<{ account: Account; created: boolean }> {
  const safeInitialBalance = Number.isFinite(initialBalance) ? Math.max(0, initialBalance) : 0;
  return storeEnsureAccount(accountId, safeInitialBalance);
}

type BalanceTransactionDirection = 'credit' | 'debit';

type BalanceTransactionCommand = {
  execute(): Promise<TransactionResult>;
};

function createBalanceTransactionCommand(options: {
  accountId: string;
  amount: number;
  direction: BalanceTransactionDirection;
  type: TransactionType;
  idempotencyKey: string;
  metadata: TransactionMetadata;
  validate?: (current: Account) => Promise<AccountErrorCode | null>;
}): BalanceTransactionCommand {
  const { accountId, amount, direction, type, idempotencyKey, metadata, validate } = options;
  const delta = direction === 'credit' ? amount : -amount;

  return {
    execute: async () => {
      const cached = await getCachedIdempotentResponse<TransactionResult>(idempotencyKey, {
        decodeCached: decodeTransactionResult,
      });
      if (cached !== null) {
        return cached;
      }

      return withAccountLock(accountId, () =>
        withIdempotentResponse(
          idempotencyKey,
          async () => {
            const createdAt = nowIso();
            const updated = await updateBalanceWithRetry(
              accountId,
              (current) => ({
                ...current,
                balance: current.balance + delta,
              }),
              { validate },
            );

            if (!updated.ok) {
              return err(updated.error);
            }

            const completedAt = nowIso();
            const balanceAfter = updated.value.balance;
            const balanceBefore = balanceAfter - delta;

            const transaction: Transaction = {
              transactionId: randomUUID(),
              idempotencyKey,
              type,
              accountId,
              amount,
              balanceBefore,
              balanceAfter,
              metadata,
              status: 'COMPLETED',
              createdAt,
              completedAt,
            };

            await saveTransaction(transaction);
            recordAccountDelta(type, direction, amount);

            await appendLedgerEntry({
              entryId: randomUUID(),
              transactionId: transaction.transactionId,
              accountId,
              type,
              amount: delta,
              balanceBefore,
              balanceAfter,
              metadata,
              timestamp: completedAt,
            });

            return ok(transaction);
          },
          { decodeCached: decodeTransactionResult },
        ),
      );
    },
  };
}

export async function creditBalance(
  accountId: string,
  amount: number,
  type: TransactionType,
  idempotencyKey: string,
  metadata: TransactionMetadata = {},
): Promise<TransactionResult> {
  if (amount <= 0) {
    return err('INVALID_AMOUNT');
  }

  return createBalanceTransactionCommand({
    accountId,
    amount,
    direction: 'credit',
    type,
    idempotencyKey,
    metadata,
  }).execute();
}

export async function debitBalance(
  accountId: string,
  amount: number,
  type: TransactionType,
  idempotencyKey: string,
  metadata: TransactionMetadata = {},
  options: { useAvailableBalance?: boolean } = {},
): Promise<TransactionResult> {
  if (amount <= 0) {
    return err('INVALID_AMOUNT');
  }

  const useAvailableBalance = options.useAvailableBalance ?? true;
  const validate = async (current: Account): Promise<AccountErrorCode | null> => {
    if (!useAvailableBalance) {
      return current.balance < amount ? 'INSUFFICIENT_BALANCE' : null;
    }

    const reservedAmount = await getReservedAmount(accountId);
    return current.balance - reservedAmount < amount ? 'INSUFFICIENT_BALANCE' : null;
  };

  return createBalanceTransactionCommand({
    accountId,
    amount,
    direction: 'debit',
    type,
    idempotencyKey,
    metadata,
    validate,
  }).execute();
}

export async function processCashOut(
  accountId: string,
  tableId: string,
  seatId: number,
  amount: number,
  idempotencyKey: string,
  handId?: string,
): Promise<CashOutResult> {
  const result = await creditBalance(accountId, amount, 'CASH_OUT', idempotencyKey, {
    tableId,
    seatId,
    handId,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    transactionId: result.value.transactionId,
    newBalance: result.value.balanceAfter,
  };
}

export async function processDeposit(
  accountId: string,
  amount: number,
  source: string,
  idempotencyKey: string,
): Promise<TransactionResult> {
  // Ensure account exists
  await ensureAccount(accountId);

  return creditBalance(accountId, amount, resolveDepositType(source), idempotencyKey, { source });
}

export async function processWithdrawal(
  accountId: string,
  amount: number,
  idempotencyKey: string,
  reason?: string,
): Promise<TransactionResult> {
  return debitBalance(accountId, amount, 'WITHDRAW', idempotencyKey, { reason });
}
