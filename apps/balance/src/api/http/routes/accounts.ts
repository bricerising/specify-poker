import { Router, Request, Response } from "express";
import {
  getBalance,
  ensureAccount,
  processDeposit,
  processWithdrawal,
} from "../../../services/accountService";
import { getTransactionsByAccount } from "../../../storage/transactionStore";
import { queryLedger } from "../../../services/ledgerService";
import { toNonEmptyString, toNumber } from "../../validation";

const router = Router();

// Get account balance
router.get("/:accountId/balance", async (req: Request, res: Response) => {
  const accountId = toNonEmptyString(req.params.accountId);
  if (!accountId) {
    return res.status(400).json({
      error: "INVALID_ACCOUNT_ID",
      message: "AccountId is required",
    });
  }

  const balance = await getBalance(accountId);
  if (!balance) {
    return res.status(404).json({
      error: "ACCOUNT_NOT_FOUND",
      message: `Account ${accountId} not found`,
    });
  }

  res.json(balance);
});

// Ensure account exists (create if not)
router.post("/:accountId", async (req: Request, res: Response) => {
  const accountId = toNonEmptyString(req.params.accountId);
  if (!accountId) {
    return res.status(400).json({
      error: "INVALID_ACCOUNT_ID",
      message: "AccountId is required",
    });
  }

  const initialBalance = toNumber((req.body as { initialBalance?: unknown })?.initialBalance, 0);
  if (!Number.isFinite(initialBalance) || initialBalance < 0) {
    return res.status(400).json({
      error: "INVALID_AMOUNT",
      message: "initialBalance must be a non-negative number",
    });
  }

  const result = await ensureAccount(accountId, initialBalance);

  res.status(result.created ? 201 : 200).json({
    accountId: result.account.accountId,
    balance: result.account.balance,
    currency: result.account.currency,
    created: result.created,
  });
});

// Deposit chips
router.post("/:accountId/deposit", async (req: Request, res: Response) => {
  const accountId = toNonEmptyString(req.params.accountId);
  if (!accountId) {
    return res.status(400).json({
      error: "INVALID_ACCOUNT_ID",
      message: "AccountId is required",
    });
  }

  const idempotencyKey = toNonEmptyString(req.headers["idempotency-key"]);

  if (!idempotencyKey) {
    return res.status(400).json({
      error: "MISSING_IDEMPOTENCY_KEY",
      message: "Idempotency-Key header is required",
    });
  }

  const body = req.body as { amount?: unknown; source?: unknown };
  const amount = toNumber(body?.amount, Number.NaN);
  const source = toNonEmptyString(body?.source);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      error: "INVALID_AMOUNT",
      message: "Amount must be a positive number",
    });
  }

  if (!source) {
    return res.status(400).json({
      error: "MISSING_SOURCE",
      message: "Source is required (FREEROLL, PURCHASE, ADMIN, BONUS)",
    });
  }

  const result = await processDeposit(accountId, amount, source, idempotencyKey);

  if (!result.ok) {
    return res.status(400).json({
      error: result.error,
      message: `Deposit failed: ${result.error}`,
    });
  }

  res.json({
    transactionId: result.transaction.transactionId,
    type: result.transaction.type,
    amount: result.transaction.amount,
    balanceBefore: result.transaction.balanceBefore,
    balanceAfter: result.transaction.balanceAfter,
    status: result.transaction.status,
    createdAt: result.transaction.createdAt,
    completedAt: result.transaction.completedAt,
  });
});

// Withdraw chips
router.post("/:accountId/withdraw", async (req: Request, res: Response) => {
  const accountId = toNonEmptyString(req.params.accountId);
  if (!accountId) {
    return res.status(400).json({
      error: "INVALID_ACCOUNT_ID",
      message: "AccountId is required",
    });
  }

  const idempotencyKey = toNonEmptyString(req.headers["idempotency-key"]);

  if (!idempotencyKey) {
    return res.status(400).json({
      error: "MISSING_IDEMPOTENCY_KEY",
      message: "Idempotency-Key header is required",
    });
  }

  const body = req.body as { amount?: unknown; reason?: unknown };
  const amount = toNumber(body?.amount, Number.NaN);
  const reason = toNonEmptyString(body?.reason) ?? undefined;

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      error: "INVALID_AMOUNT",
      message: "Amount must be a positive number",
    });
  }

  const result = await processWithdrawal(accountId, amount, idempotencyKey, reason);

  if (!result.ok) {
    const status = result.error === "INSUFFICIENT_BALANCE" ? 400 : 400;
    return res.status(status).json({
      error: result.error,
      message: `Withdrawal failed: ${result.error}`,
    });
  }

  res.json({
    transactionId: result.transaction.transactionId,
    type: result.transaction.type,
    amount: result.transaction.amount,
    balanceBefore: result.transaction.balanceBefore,
    balanceAfter: result.transaction.balanceAfter,
    status: result.transaction.status,
    createdAt: result.transaction.createdAt,
    completedAt: result.transaction.completedAt,
  });
});

// Get transaction history
router.get("/:accountId/transactions", async (req: Request, res: Response) => {
  const accountId = toNonEmptyString(req.params.accountId);
  if (!accountId) {
    return res.status(400).json({
      error: "INVALID_ACCOUNT_ID",
      message: "AccountId is required",
    });
  }

  const limitRaw = toNumber(req.query.limit, 50);
  const offsetRaw = toNumber(req.query.offset, 0);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
  const type = toNonEmptyString(req.query.type) ?? undefined;

  const result = await getTransactionsByAccount(accountId, { limit, offset, type });

  res.json({
    transactions: result.transactions.map((tx) => ({
      transactionId: tx.transactionId,
      type: tx.type,
      amount: tx.amount,
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
      status: tx.status,
      metadata: tx.metadata,
      createdAt: tx.createdAt,
      completedAt: tx.completedAt,
    })),
    total: result.total,
    limit,
    offset,
  });
});

// Get ledger entries
router.get("/:accountId/ledger", async (req: Request, res: Response) => {
  const accountId = toNonEmptyString(req.params.accountId);
  if (!accountId) {
    return res.status(400).json({
      error: "INVALID_ACCOUNT_ID",
      message: "AccountId is required",
    });
  }

  const limitRaw = toNumber(req.query.limit, 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 50;
  const from = toNonEmptyString(req.query.from) ?? undefined;
  const to = toNonEmptyString(req.query.to) ?? undefined;

  const result = await queryLedger(accountId, { limit, from, to });

  res.json({
    entries: result.entries,
    total: result.total,
    latestChecksum: result.latestChecksum,
  });
});

export default router;
