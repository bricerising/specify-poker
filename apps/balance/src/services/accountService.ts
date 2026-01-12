import { randomUUID } from "crypto";
import {
  Account,
  BalanceInfo,
  CashOutResult,
  Transaction,
  TransactionType,
  TransactionMetadata,
} from "../domain/types";
import {
  ensureAccount as storeEnsureAccount,
  getAccount,
  updateAccountWithVersion,
} from "../storage/accountStore";
import { saveTransaction } from "../storage/transactionStore";
import { appendLedgerEntry } from "../storage/ledgerStore";
import { getIdempotentResponse, setIdempotentResponse } from "../storage/idempotencyStore";
import { getActiveReservationsByAccount } from "../storage/reservationStore";
import { recordAccountDelta } from "../observability/metrics";

function now(): string {
  return new Date().toISOString();
}

async function updateBalanceWithRetry(
  accountId: string,
  updater: (current: Account) => Account,
  maxRetries: number = 3
): Promise<{ ok: boolean; account?: Account; error?: string }> {
  let current = await getAccount(accountId);
  if (!current) {
    return { ok: false, error: "ACCOUNT_NOT_FOUND" };
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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
): Promise<{ ok: boolean; transaction?: Transaction; error?: string }> {
  if (amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }

  // Check idempotency
  const existingResponse = await getIdempotentResponse(idempotencyKey);
  if (existingResponse) {
    return existingResponse as { ok: boolean; transaction?: Transaction };
  }

  const account = await getAccount(accountId);
  if (!account) {
    const result = { ok: false, error: "ACCOUNT_NOT_FOUND" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
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
    createdAt: now(),
    completedAt: null,
  };

  // Update account balance with optimistic locking
  const updated = await updateBalanceWithRetry(accountId, (current) => ({
    ...current,
    balance: current.balance + amount,
  }));

  if (!updated.ok || !updated.account) {
    const result = { ok: false, error: updated.error ?? "UPDATE_FAILED" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  // Mark transaction complete
  transaction.status = "COMPLETED";
  transaction.completedAt = now();
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
    timestamp: now(),
  });

  const result = { ok: true, transaction };
  await setIdempotentResponse(idempotencyKey, result);
  return result;
}

export async function debitBalance(
  accountId: string,
  amount: number,
  type: TransactionType,
  idempotencyKey: string,
  metadata: TransactionMetadata = {},
  options: { useAvailableBalance?: boolean } = {}
): Promise<{ ok: boolean; transaction?: Transaction; error?: string }> {
  if (amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }

  // Check idempotency
  const existingResponse = await getIdempotentResponse(idempotencyKey);
  if (existingResponse) {
    return existingResponse as { ok: boolean; transaction?: Transaction };
  }

  const useAvailableBalance = options.useAvailableBalance ?? true;
  const balanceInfo = useAvailableBalance ? await getBalance(accountId) : null;
  const account = useAvailableBalance ? null : await getAccount(accountId);

  if (useAvailableBalance && !balanceInfo) {
    const result = { ok: false, error: "ACCOUNT_NOT_FOUND" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }
  if (!useAvailableBalance && !account) {
    const result = { ok: false, error: "ACCOUNT_NOT_FOUND" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  if (useAvailableBalance && balanceInfo!.availableBalance < amount) {
    const result = { ok: false, error: "INSUFFICIENT_BALANCE" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }
  if (!useAvailableBalance && account!.balance < amount) {
    const result = { ok: false, error: "INSUFFICIENT_BALANCE" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  const transaction: Transaction = {
    transactionId: randomUUID(),
    idempotencyKey,
    type,
    accountId,
    amount,
    balanceBefore: useAvailableBalance ? balanceInfo!.balance : account!.balance,
    balanceAfter: (useAvailableBalance ? balanceInfo!.balance : account!.balance) - amount,
    metadata,
    status: "PENDING",
    createdAt: now(),
    completedAt: null,
  };

  let updatedAccount: Account | null = null;
  let updateError: string | undefined;
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const current = await getAccount(accountId);
    if (!current) {
      updateError = "ACCOUNT_NOT_FOUND";
      break;
    }

    if (useAvailableBalance) {
      const activeReservations = await getActiveReservationsByAccount(accountId);
      const reservedAmount = activeReservations.reduce((sum, r) => sum + r.amount, 0);
      if (current.balance - reservedAmount < amount) {
        updateError = "INSUFFICIENT_BALANCE";
        break;
      }
    } else if (current.balance < amount) {
      updateError = "INSUFFICIENT_BALANCE";
      break;
    }

    const updated = await updateAccountWithVersion(accountId, current.version, (acc) => ({
      ...acc,
      balance: acc.balance - amount,
    }));

    if (updated.ok && updated.account) {
      updatedAccount = updated.account;
      break;
    }
    if (updated.error && updated.error !== "VERSION_CONFLICT") {
      updateError = updated.error;
      break;
    }
  }

  if (!updatedAccount) {
    const result = { ok: false, error: updateError ?? "UPDATE_FAILED" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  // Mark transaction complete
  transaction.status = "COMPLETED";
  transaction.completedAt = now();
  transaction.balanceAfter = updatedAccount.balance;
  transaction.balanceBefore = updatedAccount.balance + amount;
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
    timestamp: now(),
  });

  const result = { ok: true, transaction };
  await setIdempotentResponse(idempotencyKey, result);
  return result;
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
    transactionId: result.transaction?.transactionId,
    newBalance: result.transaction?.balanceAfter,
  };
}

export async function processDeposit(
  accountId: string,
  amount: number,
  source: string,
  idempotencyKey: string
): Promise<{ ok: boolean; transaction?: Transaction; error?: string }> {
  // Ensure account exists
  await ensureAccount(accountId);

  return creditBalance(accountId, amount, resolveDepositType(source), idempotencyKey, { source });
}

export async function processWithdrawal(
  accountId: string,
  amount: number,
  idempotencyKey: string,
  reason?: string
): Promise<{ ok: boolean; transaction?: Transaction; error?: string }> {
  return debitBalance(accountId, amount, "WITHDRAW", idempotencyKey, { reason });
}
