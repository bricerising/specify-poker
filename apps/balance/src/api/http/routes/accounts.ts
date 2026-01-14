import { Router, Request, Response } from "express";
import {
  getBalance,
  ensureAccount,
  processDeposit,
  processWithdrawal,
} from "../../../services/accountService";
import { getTransactionsByAccount } from "../../../storage/transactionStore";
import { queryLedger } from "../../../services/ledgerService";

const router = Router();

// Get account balance
router.get("/:accountId/balance", async (req: Request, res: Response) => {
  const { accountId } = req.params;

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
  const { accountId } = req.params;
  const { initialBalance = 0 } = req.body;

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
  const { accountId } = req.params;
  const idempotencyKey = req.headers["idempotency-key"] as string;

  if (!idempotencyKey) {
    return res.status(400).json({
      error: "MISSING_IDEMPOTENCY_KEY",
      message: "Idempotency-Key header is required",
    });
  }

  const { amount, source } = req.body;

  if (!amount || amount <= 0) {
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
    transactionId: result.transaction?.transactionId,
    type: result.transaction?.type,
    amount: result.transaction?.amount,
    balanceBefore: result.transaction?.balanceBefore,
    balanceAfter: result.transaction?.balanceAfter,
    status: result.transaction?.status,
    createdAt: result.transaction?.createdAt,
    completedAt: result.transaction?.completedAt,
  });
});

// Withdraw chips
router.post("/:accountId/withdraw", async (req: Request, res: Response) => {
  const { accountId } = req.params;
  const idempotencyKey = req.headers["idempotency-key"] as string;

  if (!idempotencyKey) {
    return res.status(400).json({
      error: "MISSING_IDEMPOTENCY_KEY",
      message: "Idempotency-Key header is required",
    });
  }

  const { amount, reason } = req.body;

  if (!amount || amount <= 0) {
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
    transactionId: result.transaction?.transactionId,
    type: result.transaction?.type,
    amount: result.transaction?.amount,
    balanceBefore: result.transaction?.balanceBefore,
    balanceAfter: result.transaction?.balanceAfter,
    status: result.transaction?.status,
    createdAt: result.transaction?.createdAt,
    completedAt: result.transaction?.completedAt,
  });
});

// Get transaction history
router.get("/:accountId/transactions", async (req: Request, res: Response) => {
  const { accountId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const type = req.query.type as string | undefined;

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
  const { accountId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const result = await queryLedger(accountId, { limit, from, to });

  res.json({
    entries: result.entries,
    total: result.total,
    latestChecksum: result.latestChecksum,
  });
});

export default router;
