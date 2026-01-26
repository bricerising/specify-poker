import { randomUUID } from "crypto";
import {
  Account,
  BalanceInfo,
  CashOutResult,
  Transaction,
  TransactionType,
  TransactionMetadata,
} from "../domain/types";
import { nowIso } from "../utils/time";
import {
  ensureAccount as storeEnsureAccount,
  getAccount,
  updateAccountWithVersion,
} from "../storage/accountStore";
import { saveTransaction } from "../storage/transactionStore";
import { appendLedgerEntry } from "../storage/ledgerStore";
import { getActiveReservationsByAccount } from "../storage/reservationStore";
import { recordAccountDelta } from "../observability/metrics";
import { withIdempotentResponse } from "../utils/idempotency";

type TransactionResult =
  | { ok: true; transaction: Transaction }
  | { ok: false; error: string };

async function updateBalanceWithRetry(
  accountId: string,
  updater: (current: Account) => Account,
  options: { maxRetries?: number; validate?: (current: Account) => Promise<string | null> } = {}
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const { maxRetries = 10, validate } = options;
  let current = await getAccount(accountId);
  if (!current) {
    return { ok: false, error: "ACCOUNT_NOT_FOUND" };
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (validate) {
      const error = await validate(current);
      if (error) {
        return { ok: false, error };
      }
    }

    const updated = await updateAccountWithVersion(accountId, current.version, updater);
    if (updated.ok && updated.account) {
      return { ok: true, account: updated.account };
    }
    if (updated.error !== "VERSION_CONFLICT") {
      return { ok: false, error: updated.error ?? "UPDATE_FAILED" };
    }
    current = await getAccount(accountId);
    if (!current) {
      return { ok: false, error: "ACCOUNT_NOT_FOUND" };
    }
  }

  return { ok: false, error: "VERSION_CONFLICT" };
}

function resolveDepositType(source: string): TransactionType {
  if (source === "BONUS") {
    return "BONUS";
  }
  if (source === "REFERRAL") {
    return "REFERRAL";
  }
  return "DEPOSIT";
}

export async function getBalance(accountId: string): Promise<BalanceInfo | null> {
  const account = await getAccount(accountId);
  if (!account) {
    return null;
  }

  const activeReservations = await getActiveReservationsByAccount(accountId);
  const reservedAmount = activeReservations.reduce((sum, r) => sum + r.amount, 0);

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
  initialBalance: number = 0
): Promise<{ account: Account; created: boolean }> {
  return storeEnsureAccount(accountId, initialBalance);
}

export async function creditBalance(
  accountId: string,
  amount: number,
  type: TransactionType,
  idempotencyKey: string,
  metadata: TransactionMetadata = {}
): Promise<TransactionResult> {
  if (amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }

  return withIdempotentResponse(idempotencyKey, async () => {
    const account = await getAccount(accountId);
    if (!account) {
      return { ok: false, error: "ACCOUNT_NOT_FOUND" };
    }

    const transaction: Transaction = {
      transactionId: randomUUID(),
      idempotencyKey,
      type,
      accountId,
      amount,
      balanceBefore: account.balance,
      balanceAfter: account.balance + amount,
      metadata,
      status: "PENDING",
      createdAt: nowIso(),
      completedAt: null,
    };

    // Update account balance with optimistic locking
    const updated = await updateBalanceWithRetry(accountId, (current) => ({
      ...current,
      balance: current.balance + amount,
    }));

    if (!updated.ok) {
      return { ok: false, error: updated.error };
    }

    // Mark transaction complete
    transaction.status = "COMPLETED";
    transaction.completedAt = nowIso();
    transaction.balanceAfter = updated.account.balance;
    transaction.balanceBefore = updated.account.balance - amount;
    await saveTransaction(transaction);
    recordAccountDelta(type, "credit", amount);

    // Append to ledger
    await appendLedgerEntry({
      entryId: randomUUID(),
      transactionId: transaction.transactionId,
      accountId,
      type,
      amount,
      balanceBefore: transaction.balanceBefore,
      balanceAfter: transaction.balanceAfter,
      metadata,
      timestamp: nowIso(),
    });

    return { ok: true, transaction };
  });
}

export async function debitBalance(
  accountId: string,
  amount: number,
  type: TransactionType,
  idempotencyKey: string,
  metadata: TransactionMetadata = {},
  options: { useAvailableBalance?: boolean } = {}
): Promise<TransactionResult> {
  if (amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }

  return withIdempotentResponse(idempotencyKey, async () => {
    const useAvailableBalance = options.useAvailableBalance ?? true;

    const transaction: Transaction = {
      transactionId: randomUUID(),
      idempotencyKey,
      type,
      accountId,
      amount,
      balanceBefore: 0,
      balanceAfter: 0,
      metadata,
      status: "PENDING",
      createdAt: nowIso(),
      completedAt: null,
    };

    const updated = await updateBalanceWithRetry(
      accountId,
      (acc) => ({
        ...acc,
        balance: acc.balance - amount,
      }),
      {
        validate: async (current) => {
          if (useAvailableBalance) {
            const activeReservations = await getActiveReservationsByAccount(accountId);
            const reservedAmount = activeReservations.reduce((sum, r) => sum + r.amount, 0);
            return current.balance - reservedAmount < amount ? "INSUFFICIENT_BALANCE" : null;
          }
          return current.balance < amount ? "INSUFFICIENT_BALANCE" : null;
        },
      }
    );

    if (!updated.ok) {
      return { ok: false, error: updated.error };
    }

    // Mark transaction complete
    transaction.status = "COMPLETED";
    transaction.completedAt = nowIso();
    transaction.balanceAfter = updated.account.balance;
    transaction.balanceBefore = updated.account.balance + amount;
    await saveTransaction(transaction);
    recordAccountDelta(type, "debit", amount);

    // Append to ledger
    await appendLedgerEntry({
      entryId: randomUUID(),
      transactionId: transaction.transactionId,
      accountId,
      type,
      amount: -amount, // Negative for debit
      balanceBefore: transaction.balanceBefore,
      balanceAfter: transaction.balanceAfter,
      metadata,
      timestamp: nowIso(),
    });

    return { ok: true, transaction };
  });
}

export async function processCashOut(
  accountId: string,
  tableId: string,
  seatId: number,
  amount: number,
  idempotencyKey: string,
  handId?: string
): Promise<CashOutResult> {
  const result = await creditBalance(accountId, amount, "CASH_OUT", idempotencyKey, {
    tableId,
    seatId,
    handId,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    transactionId: result.transaction.transactionId,
    newBalance: result.transaction.balanceAfter,
  };
}

export async function processDeposit(
  accountId: string,
  amount: number,
  source: string,
  idempotencyKey: string
): Promise<TransactionResult> {
  // Ensure account exists
  await ensureAccount(accountId);

  return creditBalance(accountId, amount, resolveDepositType(source), idempotencyKey, { source });
}

export async function processWithdrawal(
  accountId: string,
  amount: number,
  idempotencyKey: string,
  reason?: string
): Promise<TransactionResult> {
  return debitBalance(accountId, amount, "WITHDRAW", idempotencyKey, { reason });
}
