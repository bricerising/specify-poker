import { randomUUID } from 'crypto';
import {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type Account,
  type BalanceInfo,
  type CashOutResult,
  type LedgerEntry,
  type Reservation,
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
  getAccount as storeGetAccount,
  withAccountLock as storeWithAccountLock,
  updateAccountWithVersion as storeUpdateAccountWithVersion,
} from '../storage/accountStore';
import { saveTransaction as storeSaveTransaction } from '../storage/transactionStore';
import { appendLedgerEntry as storeAppendLedgerEntry } from '../storage/ledgerStore';
import { getActiveReservationsByAccount as storeGetActiveReservationsByAccount } from '../storage/reservationStore';
import { recordAccountDelta as metricsRecordAccountDelta } from '../observability/metrics';
import {
  getCachedIdempotentResponse as utilGetCachedIdempotentResponse,
  withIdempotentResponse as utilWithIdempotentResponse,
} from '../utils/idempotency';
import { asFiniteNumber, asString, isRecord } from '../utils/guards';

// =============================================================================
// Types
// =============================================================================

type TransactionResult = Result<Transaction, AccountErrorCode>;
type BalanceTransactionDirection = 'credit' | 'debit';

type UpdateAccountResult =
  | { ok: true; value: Account }
  | { ok: false; error?: AccountErrorCode };

export type AccountServiceDependencies = {
  readonly accountStore: {
    getAccount(accountId: string): Promise<Account | null>;
    ensureAccount(
      accountId: string,
      initialBalance: number,
    ): Promise<{ account: Account; created: boolean }>;
    withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T>;
    updateAccountWithVersion(
      accountId: string,
      version: number,
      updater: (current: Account) => Account,
    ): Promise<UpdateAccountResult>;
  };
  readonly transactionStore: {
    saveTransaction(transaction: Transaction): Promise<void>;
  };
  readonly ledgerStore: {
    appendLedgerEntry(
      entry: Omit<LedgerEntry, 'checksum' | 'previousChecksum'>,
    ): Promise<LedgerEntry>;
  };
  readonly reservationStore: {
    getActiveReservationsByAccount(accountId: string): Promise<Reservation[]>;
  };
  readonly metrics: {
    recordAccountDelta(
      type: TransactionType,
      direction: BalanceTransactionDirection,
      amount: number,
    ): void;
  };
  readonly idempotency: {
    getCachedIdempotentResponse<T>(
      key: string,
      options: { decodeCached: (cached: unknown) => T | null },
    ): Promise<T | null>;
    withIdempotentResponse<T>(
      key: string,
      fn: () => Promise<T>,
      options: { decodeCached: (cached: unknown) => T | null },
    ): Promise<T>;
  };
  readonly clock: {
    nowIso(): string;
  };
  readonly ids: {
    randomUUID(): string;
  };
};

// =============================================================================
// Parsing utilities (module-private)
// =============================================================================

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

function resolveDepositType(source: string): TransactionType {
  const normalized = source.trim().toUpperCase();
  if (normalized === 'BONUS') return 'BONUS';
  if (normalized === 'REFERRAL') return 'REFERRAL';
  return 'DEPOSIT';
}

// =============================================================================
// AccountService class with dependency injection
// =============================================================================

export class AccountService {
  private readonly deps: AccountServiceDependencies;

  constructor(deps: AccountServiceDependencies) {
    this.deps = deps;
  }

  private async getReservedAmount(accountId: string): Promise<number> {
    const activeReservations =
      await this.deps.reservationStore.getActiveReservationsByAccount(accountId);
    return activeReservations.reduce((sum, r) => sum + r.amount, 0);
  }

  private async updateBalanceWithRetry(
    accountId: string,
    updater: (current: Account) => Account,
    options: {
      maxRetries?: number;
      validate?: (current: Account) => Promise<AccountErrorCode | null>;
    } = {},
  ): Promise<Result<Account, AccountErrorCode>> {
    const { maxRetries = 10, validate } = options;
    let current = await this.deps.accountStore.getAccount(accountId);
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

      const updated = await this.deps.accountStore.updateAccountWithVersion(
        accountId,
        current.version,
        updater,
      );
      if (updated.ok) {
        return ok(updated.value);
      }
      if (updated.error !== 'VERSION_CONFLICT') {
        return err(updated.error ?? 'UPDATE_FAILED');
      }
      current = await this.deps.accountStore.getAccount(accountId);
      if (!current) {
        return err('ACCOUNT_NOT_FOUND');
      }
    }

    return err('VERSION_CONFLICT');
  }

  private createBalanceTransactionCommand(options: {
    accountId: string;
    amount: number;
    direction: BalanceTransactionDirection;
    type: TransactionType;
    idempotencyKey: string;
    metadata: TransactionMetadata;
    validate?: (current: Account) => Promise<AccountErrorCode | null>;
  }): { execute(): Promise<TransactionResult> } {
    const { accountId, amount, direction, type, idempotencyKey, metadata, validate } = options;
    const delta = direction === 'credit' ? amount : -amount;

    return {
      execute: async () => {
        const cached = await this.deps.idempotency.getCachedIdempotentResponse<TransactionResult>(
          idempotencyKey,
          { decodeCached: decodeTransactionResult },
        );
        if (cached !== null) {
          return cached;
        }

        return this.deps.accountStore.withAccountLock(accountId, () =>
          this.deps.idempotency.withIdempotentResponse(
            idempotencyKey,
            async () => {
              const createdAt = this.deps.clock.nowIso();
              const updated = await this.updateBalanceWithRetry(
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

              const completedAt = this.deps.clock.nowIso();
              const balanceAfter = updated.value.balance;
              const balanceBefore = balanceAfter - delta;

              const transaction: Transaction = {
                transactionId: this.deps.ids.randomUUID(),
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

              await this.deps.transactionStore.saveTransaction(transaction);
              this.deps.metrics.recordAccountDelta(type, direction, amount);

              await this.deps.ledgerStore.appendLedgerEntry({
                entryId: this.deps.ids.randomUUID(),
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

  async getBalance(accountId: string): Promise<BalanceInfo | null> {
    const account = await this.deps.accountStore.getAccount(accountId);
    if (!account) {
      return null;
    }

    const reservedAmount = await this.getReservedAmount(accountId);

    return {
      accountId: account.accountId,
      balance: account.balance,
      availableBalance: account.balance - reservedAmount,
      currency: account.currency,
      version: account.version,
    };
  }

  async ensureAccount(
    accountId: string,
    initialBalance: number = 0,
  ): Promise<{ account: Account; created: boolean }> {
    const safeInitialBalance = Number.isFinite(initialBalance) ? Math.max(0, initialBalance) : 0;
    return this.deps.accountStore.ensureAccount(accountId, safeInitialBalance);
  }

  async creditBalance(
    accountId: string,
    amount: number,
    type: TransactionType,
    idempotencyKey: string,
    metadata: TransactionMetadata = {},
  ): Promise<TransactionResult> {
    if (amount <= 0) {
      return err('INVALID_AMOUNT');
    }

    return this.createBalanceTransactionCommand({
      accountId,
      amount,
      direction: 'credit',
      type,
      idempotencyKey,
      metadata,
    }).execute();
  }

  async debitBalance(
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

      const reservedAmount = await this.getReservedAmount(accountId);
      return current.balance - reservedAmount < amount ? 'INSUFFICIENT_BALANCE' : null;
    };

    return this.createBalanceTransactionCommand({
      accountId,
      amount,
      direction: 'debit',
      type,
      idempotencyKey,
      metadata,
      validate,
    }).execute();
  }

  async processCashOut(
    accountId: string,
    tableId: string,
    seatId: number,
    amount: number,
    idempotencyKey: string,
    handId?: string,
  ): Promise<CashOutResult> {
    const result = await this.creditBalance(accountId, amount, 'CASH_OUT', idempotencyKey, {
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

  async processDeposit(
    accountId: string,
    amount: number,
    source: string,
    idempotencyKey: string,
  ): Promise<TransactionResult> {
    await this.ensureAccount(accountId);
    return this.creditBalance(accountId, amount, resolveDepositType(source), idempotencyKey, {
      source,
    });
  }

  async processWithdrawal(
    accountId: string,
    amount: number,
    idempotencyKey: string,
    reason?: string,
  ): Promise<TransactionResult> {
    return this.debitBalance(accountId, amount, 'WITHDRAW', idempotencyKey, { reason });
  }
}

// =============================================================================
// Factory function
// =============================================================================

export function createAccountService(
  overrides: Partial<AccountServiceDependencies> = {},
): AccountService {
  const defaultDeps: AccountServiceDependencies = {
    accountStore: {
      getAccount: storeGetAccount,
      ensureAccount: storeEnsureAccount,
      withAccountLock: storeWithAccountLock,
      updateAccountWithVersion: storeUpdateAccountWithVersion,
    },
    transactionStore: {
      saveTransaction: storeSaveTransaction,
    },
    ledgerStore: {
      appendLedgerEntry: storeAppendLedgerEntry,
    },
    reservationStore: {
      getActiveReservationsByAccount: storeGetActiveReservationsByAccount,
    },
    metrics: {
      recordAccountDelta: metricsRecordAccountDelta,
    },
    idempotency: {
      getCachedIdempotentResponse: utilGetCachedIdempotentResponse,
      withIdempotentResponse: utilWithIdempotentResponse,
    },
    clock: {
      nowIso,
    },
    ids: {
      randomUUID,
    },
  };

  const deps: AccountServiceDependencies = {
    accountStore: overrides.accountStore ?? defaultDeps.accountStore,
    transactionStore: overrides.transactionStore ?? defaultDeps.transactionStore,
    ledgerStore: overrides.ledgerStore ?? defaultDeps.ledgerStore,
    reservationStore: overrides.reservationStore ?? defaultDeps.reservationStore,
    metrics: overrides.metrics ?? defaultDeps.metrics,
    idempotency: overrides.idempotency ?? defaultDeps.idempotency,
    clock: overrides.clock ?? defaultDeps.clock,
    ids: overrides.ids ?? defaultDeps.ids,
  };

  return new AccountService(deps);
}

// =============================================================================
// Default singleton instance
// =============================================================================

export const accountService = createAccountService();

// =============================================================================
// Backward-compatible module-level exports
// =============================================================================

export async function getBalance(accountId: string): Promise<BalanceInfo | null> {
  return accountService.getBalance(accountId);
}

export async function ensureAccount(
  accountId: string,
  initialBalance: number = 0,
): Promise<{ account: Account; created: boolean }> {
  return accountService.ensureAccount(accountId, initialBalance);
}

export async function creditBalance(
  accountId: string,
  amount: number,
  type: TransactionType,
  idempotencyKey: string,
  metadata: TransactionMetadata = {},
): Promise<TransactionResult> {
  return accountService.creditBalance(accountId, amount, type, idempotencyKey, metadata);
}

export async function debitBalance(
  accountId: string,
  amount: number,
  type: TransactionType,
  idempotencyKey: string,
  metadata: TransactionMetadata = {},
  options: { useAvailableBalance?: boolean } = {},
): Promise<TransactionResult> {
  return accountService.debitBalance(accountId, amount, type, idempotencyKey, metadata, options);
}

export async function processCashOut(
  accountId: string,
  tableId: string,
  seatId: number,
  amount: number,
  idempotencyKey: string,
  handId?: string,
): Promise<CashOutResult> {
  return accountService.processCashOut(accountId, tableId, seatId, amount, idempotencyKey, handId);
}

export async function processDeposit(
  accountId: string,
  amount: number,
  source: string,
  idempotencyKey: string,
): Promise<TransactionResult> {
  return accountService.processDeposit(accountId, amount, source, idempotencyKey);
}

export async function processWithdrawal(
  accountId: string,
  amount: number,
  idempotencyKey: string,
  reason?: string,
): Promise<TransactionResult> {
  return accountService.processWithdrawal(accountId, amount, idempotencyKey, reason);
}
