import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Transaction } from '../../../domain/types';
import type { BalanceService } from '../../../services/balanceService';
import { toNonEmptyString, toNumber } from '../../validation';

function badRequest(res: Response, error: string, message: string) {
  return res.status(400).json({ error, message });
}

function requireAccountId(req: Request, res: Response): string | null {
  const accountId = toNonEmptyString(req.params.accountId);
  if (!accountId) {
    badRequest(res, 'INVALID_ACCOUNT_ID', 'AccountId is required');
    return null;
  }
  return accountId;
}

function requireIdempotencyKey(req: Request, res: Response): string | null {
  const idempotencyKey = toNonEmptyString(req.headers['idempotency-key']);
  if (!idempotencyKey) {
    badRequest(res, 'MISSING_IDEMPOTENCY_KEY', 'Idempotency-Key header is required');
    return null;
  }
  return idempotencyKey;
}

function toTransactionResponse(tx: Transaction) {
  return {
    transactionId: tx.transactionId,
    type: tx.type,
    amount: tx.amount,
    balanceBefore: tx.balanceBefore,
    balanceAfter: tx.balanceAfter,
    status: tx.status,
    createdAt: tx.createdAt,
    completedAt: tx.completedAt,
  };
}

function toTransactionHistoryItem(tx: Transaction) {
  return {
    ...toTransactionResponse(tx),
    metadata: tx.metadata,
  };
}

export function createAccountRoutes(service: BalanceService): Router {
  const router = Router();

  // Get account balance
  router.get('/:accountId/balance', async (req: Request, res: Response) => {
    const accountId = requireAccountId(req, res);
    if (!accountId) {
      return;
    }

    const balance = await service.getBalance(accountId);
    if (!balance) {
      return res.status(404).json({
        error: 'ACCOUNT_NOT_FOUND',
        message: `Account ${accountId} not found`,
      });
    }

    res.json(balance);
  });

  // Ensure account exists (create if not)
  router.post('/:accountId', async (req: Request, res: Response) => {
    const accountId = requireAccountId(req, res);
    if (!accountId) {
      return;
    }

    const body = req.body as { initialBalance?: unknown };
    const initialBalanceRaw = body?.initialBalance;
    const initialBalance =
      initialBalanceRaw === undefined ? 0 : toNumber(initialBalanceRaw, Number.NaN);
    if (!Number.isFinite(initialBalance) || initialBalance < 0) {
      return badRequest(res, 'INVALID_AMOUNT', 'initialBalance must be a non-negative number');
    }

    const result = await service.ensureAccount(accountId, initialBalance);

    res.status(result.created ? 201 : 200).json({
      accountId: result.account.accountId,
      balance: result.account.balance,
      currency: result.account.currency,
      created: result.created,
    });
  });

  // Deposit chips
  router.post('/:accountId/deposit', async (req: Request, res: Response) => {
    const accountId = requireAccountId(req, res);
    if (!accountId) {
      return;
    }

    const idempotencyKey = requireIdempotencyKey(req, res);
    if (!idempotencyKey) {
      return;
    }

    const body = req.body as { amount?: unknown; source?: unknown };
    const amount = toNumber(body?.amount, Number.NaN);
    const source = toNonEmptyString(body?.source);

    if (!Number.isFinite(amount) || amount <= 0) {
      return badRequest(res, 'INVALID_AMOUNT', 'Amount must be a positive number');
    }

    if (!source) {
      return badRequest(
        res,
        'MISSING_SOURCE',
        'Source is required (FREEROLL, PURCHASE, ADMIN, BONUS)',
      );
    }

    const result = await service.processDeposit(accountId, amount, source, idempotencyKey);

    if (!result.ok) {
      return res.status(400).json({
        error: result.error,
        message: `Deposit failed: ${result.error}`,
      });
    }

    res.json(toTransactionResponse(result.value));
  });

  // Withdraw chips
  router.post('/:accountId/withdraw', async (req: Request, res: Response) => {
    const accountId = requireAccountId(req, res);
    if (!accountId) {
      return;
    }

    const idempotencyKey = requireIdempotencyKey(req, res);
    if (!idempotencyKey) {
      return;
    }

    const body = req.body as { amount?: unknown; reason?: unknown };
    const amount = toNumber(body?.amount, Number.NaN);
    const reason = toNonEmptyString(body?.reason) ?? undefined;

    if (!Number.isFinite(amount) || amount <= 0) {
      return badRequest(res, 'INVALID_AMOUNT', 'Amount must be a positive number');
    }

    const result = await service.processWithdrawal(accountId, amount, idempotencyKey, reason);

    if (!result.ok) {
      return res.status(400).json({
        error: result.error,
        message: `Withdrawal failed: ${result.error}`,
      });
    }

    res.json(toTransactionResponse(result.value));
  });

  // Get transaction history
  router.get('/:accountId/transactions', async (req: Request, res: Response) => {
    const accountId = requireAccountId(req, res);
    if (!accountId) {
      return;
    }

    const limitRaw = toNumber(req.query.limit, 50);
    const offsetRaw = toNumber(req.query.offset, 0);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
    const type = toNonEmptyString(req.query.type) ?? undefined;

    const result = await service.getTransactionsByAccount(accountId, { limit, offset, type });

    res.json({
      transactions: result.transactions.map((tx) => toTransactionHistoryItem(tx)),
      total: result.total,
      limit,
      offset,
    });
  });

  // Get ledger entries
  router.get('/:accountId/ledger', async (req: Request, res: Response) => {
    const accountId = requireAccountId(req, res);
    if (!accountId) {
      return;
    }

    const limitRaw = toNumber(req.query.limit, 50);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 50;
    const from = toNonEmptyString(req.query.from) ?? undefined;
    const to = toNonEmptyString(req.query.to) ?? undefined;

    const result = await service.queryLedger(accountId, { limit, from, to });

    res.json({
      entries: result.entries,
      total: result.total,
      latestChecksum: result.latestChecksum,
    });
  });

  return router;
}
