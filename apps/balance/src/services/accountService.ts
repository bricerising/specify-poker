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
  updateAccount,
} from "../storage/accountStore";
import { saveTransaction } from "../storage/transactionStore";
import { appendLedgerEntry } from "../storage/ledgerStore";
import { getIdempotentResponse, setIdempotentResponse } from "../storage/idempotencyStore";
import { getActiveReservationsByAccount } from "../storage/reservationStore";

function now(): string {
  return new Date().toISOString();
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

  const balanceBefore = account.balance;
  const balanceAfter = balanceBefore + amount;

  const transaction: Transaction = {
    transactionId: randomUUID(),
    idempotencyKey,
    type,
    accountId,
    amount,
    balanceBefore,
    balanceAfter,
    metadata,
    status: "PENDING",
    createdAt: now(),
    completedAt: null,
  };

  // Update account balance
  const updated = await updateAccount(accountId, (current) => ({
    ...current,
    balance: balanceAfter,
  }));

  if (!updated) {
    const result = { ok: false, error: "UPDATE_FAILED" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  // Mark transaction complete
  transaction.status = "COMPLETED";
  transaction.completedAt = now();
  await saveTransaction(transaction);

  // Append to ledger
  await appendLedgerEntry({
    entryId: randomUUID(),
    transactionId: transaction.transactionId,
    accountId,
    type,
    amount,
    balanceBefore,
    balanceAfter,
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

  const balanceInfo = await getBalance(accountId);
  if (!balanceInfo) {
    const result = { ok: false, error: "ACCOUNT_NOT_FOUND" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  if (balanceInfo.availableBalance < amount) {
    const result = { ok: false, error: "INSUFFICIENT_BALANCE" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  const balanceBefore = balanceInfo.balance;
  const balanceAfter = balanceBefore - amount;

  const transaction: Transaction = {
    transactionId: randomUUID(),
    idempotencyKey,
    type,
    accountId,
    amount,
    balanceBefore,
    balanceAfter,
    metadata,
    status: "PENDING",
    createdAt: now(),
    completedAt: null,
  };

  // Update account balance
  const updated = await updateAccount(accountId, (current) => ({
    ...current,
    balance: balanceAfter,
  }));

  if (!updated) {
    const result = { ok: false, error: "UPDATE_FAILED" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  // Mark transaction complete
  transaction.status = "COMPLETED";
  transaction.completedAt = now();
  await saveTransaction(transaction);

  // Append to ledger
  await appendLedgerEntry({
    entryId: randomUUID(),
    transactionId: transaction.transactionId,
    accountId,
    type,
    amount: -amount, // Negative for debit
    balanceBefore,
    balanceAfter,
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

  return creditBalance(accountId, amount, "DEPOSIT", idempotencyKey, { source });
}

export async function processWithdrawal(
  accountId: string,
  amount: number,
  idempotencyKey: string,
  reason?: string
): Promise<{ ok: boolean; transaction?: Transaction; error?: string }> {
  return debitBalance(accountId, amount, "WITHDRAW", idempotencyKey, { reason });
}
