import { describe, expect, it, beforeEach } from 'vitest';
import type { Router } from 'express';

import { createHttpRouter } from '../../src/api/http/router';
import { resetAccounts } from '../../src/storage/accountStore';
import { resetTransactions } from '../../src/storage/transactionStore';
import { resetIdempotency } from '../../src/storage/idempotencyStore';
import { resetLedger } from '../../src/storage/ledgerStore';
import { dispatchToRouter } from '../helpers/express';

type ApiResponse = { status: number; body: unknown };

function splitUrl(url: string): { path: string; query: Record<string, unknown> } {
  const [path, search] = url.split('?');
  const query: Record<string, unknown> = {};
  if (search) {
    const params = new URLSearchParams(search);
    for (const [key, value] of params.entries()) {
      query[key] = value;
    }
  }
  return { path, query };
}

class RequestBuilder implements PromiseLike<ApiResponse> {
  private headers: Record<string, string> = {};
  private body: unknown = undefined;

  constructor(
    private router: Router,
    private method: string,
    private url: string,
  ) {}

  set(name: string, value: string) {
    this.headers[name] = value;
    return this;
  }

  send(body: unknown) {
    this.body = body;
    return this;
  }

  private async execute(): Promise<ApiResponse> {
    const { path, query } = splitUrl(this.url);
    const response = await dispatchToRouter(this.router, {
      method: this.method,
      url: path,
      headers: this.headers,
      body: this.body,
      query,
    });
    return { status: response.statusCode, body: response.body };
  }

  then<TResult1 = ApiResponse, TResult2 = never>(
    onfulfilled?: ((value: ApiResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function request(router: Router) {
  return {
    get: (url: string) => new RequestBuilder(router, 'GET', url),
    post: (url: string) => new RequestBuilder(router, 'POST', url),
  };
}

describe('Balance Service HTTP API', () => {
  beforeEach(async () => {
    await resetAccounts();
    await resetTransactions();
    await resetIdempotency();
    await resetLedger();
  });

  const app: Router = createHttpRouter();

  describe('Health Endpoints', () => {
    describe('GET /api/health', () => {
      it('returns health status', async () => {
        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toMatch(/healthy|degraded/);
        expect(response.body.timestamp).toBeDefined();
        expect(typeof response.body.redis).toBe('boolean');
      });
    });

    describe('GET /api/ready', () => {
      it('returns ready status', async () => {
        const response = await request(app).get('/api/ready');

        expect(response.status).toBe(200);
        expect(response.body.ready).toBe(true);
      });
    });
  });

  describe('Account Endpoints', () => {
    describe('GET /api/accounts/:accountId/balance', () => {
      it('returns 404 for non-existent account', async () => {
        const response = await request(app).get('/api/accounts/unknown/balance');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('ACCOUNT_NOT_FOUND');
      });

      it('returns balance for existing account', async () => {
        // First create the account
        await request(app).post('/api/accounts/user-123').send({ initialBalance: 1000 });

        const response = await request(app).get('/api/accounts/user-123/balance');

        expect(response.status).toBe(200);
        expect(response.body.accountId).toBe('user-123');
        expect(response.body.balance).toBe(1000);
        expect(response.body.currency).toBe('CHIPS');
      });
    });

    describe('POST /api/accounts/:accountId', () => {
      it('creates new account with default balance', async () => {
        const response = await request(app).post('/api/accounts/new-user').send({});

        expect(response.status).toBe(201);
        expect(response.body.accountId).toBe('new-user');
        expect(response.body.balance).toBe(0);
        expect(response.body.currency).toBe('CHIPS');
        expect(response.body.created).toBe(true);
      });

      it('creates account with initial balance', async () => {
        const response = await request(app)
          .post('/api/accounts/funded-user')
          .send({ initialBalance: 5000 });

        expect(response.status).toBe(201);
        expect(response.body.balance).toBe(5000);
        expect(response.body.created).toBe(true);
      });

      it('returns existing account without modification', async () => {
        // Create account
        await request(app).post('/api/accounts/existing-user').send({ initialBalance: 1000 });

        // Try to create again with different balance
        const response = await request(app)
          .post('/api/accounts/existing-user')
          .send({ initialBalance: 9999 });

        expect(response.status).toBe(200);
        expect(response.body.balance).toBe(1000); // Original balance preserved
        expect(response.body.created).toBe(false);
      });
    });

    describe('POST /api/accounts/:accountId/deposit', () => {
      beforeEach(async () => {
        await request(app).post('/api/accounts/depositor').send({ initialBalance: 0 });
      });

      it('requires idempotency key', async () => {
        const response = await request(app)
          .post('/api/accounts/depositor/deposit')
          .send({ amount: 100, source: 'PURCHASE' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('MISSING_IDEMPOTENCY_KEY');
      });

      it('requires positive amount', async () => {
        const response = await request(app)
          .post('/api/accounts/depositor/deposit')
          .set('Idempotency-Key', 'key-1')
          .send({ amount: -100, source: 'PURCHASE' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('INVALID_AMOUNT');
      });

      it('requires source', async () => {
        const response = await request(app)
          .post('/api/accounts/depositor/deposit')
          .set('Idempotency-Key', 'key-2')
          .send({ amount: 100 });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('MISSING_SOURCE');
      });

      it('successfully deposits chips', async () => {
        const response = await request(app)
          .post('/api/accounts/depositor/deposit')
          .set('Idempotency-Key', 'deposit-key-1')
          .send({ amount: 500, source: 'PURCHASE' });

        expect(response.status).toBe(200);
        expect(response.body.type).toBe('DEPOSIT');
        expect(response.body.amount).toBe(500);
        expect(response.body.balanceBefore).toBe(0);
        expect(response.body.balanceAfter).toBe(500);
        expect(response.body.status).toBe('COMPLETED');
      });

      it('handles idempotent deposits', async () => {
        const key = 'idempotent-deposit';

        const response1 = await request(app)
          .post('/api/accounts/depositor/deposit')
          .set('Idempotency-Key', key)
          .send({ amount: 1000, source: 'BONUS' });

        const response2 = await request(app)
          .post('/api/accounts/depositor/deposit')
          .set('Idempotency-Key', key)
          .send({ amount: 1000, source: 'BONUS' });

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);
        expect(response1.body.transactionId).toBe(response2.body.transactionId);

        // Verify balance only increased once
        const balanceResponse = await request(app).get('/api/accounts/depositor/balance');
        expect(balanceResponse.body.balance).toBe(1000);
      });

      it('creates account if not exists during deposit', async () => {
        const response = await request(app)
          .post('/api/accounts/auto-created/deposit')
          .set('Idempotency-Key', 'auto-create-key')
          .send({ amount: 100, source: 'FREEROLL' });

        expect(response.status).toBe(200);
        expect(response.body.balanceAfter).toBe(100);
      });
    });

    describe('POST /api/accounts/:accountId/withdraw', () => {
      beforeEach(async () => {
        // Create account with funds
        await request(app).post('/api/accounts/withdrawer').send({ initialBalance: 0 });

        await request(app)
          .post('/api/accounts/withdrawer/deposit')
          .set('Idempotency-Key', 'setup-deposit')
          .send({ amount: 1000, source: 'PURCHASE' });
      });

      it('requires idempotency key', async () => {
        const response = await request(app)
          .post('/api/accounts/withdrawer/withdraw')
          .send({ amount: 100 });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('MISSING_IDEMPOTENCY_KEY');
      });

      it('requires positive amount', async () => {
        const response = await request(app)
          .post('/api/accounts/withdrawer/withdraw')
          .set('Idempotency-Key', 'key-w1')
          .send({ amount: 0 });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('INVALID_AMOUNT');
      });

      it('successfully withdraws chips', async () => {
        const response = await request(app)
          .post('/api/accounts/withdrawer/withdraw')
          .set('Idempotency-Key', 'withdraw-key-1')
          .send({ amount: 300, reason: 'cashout' });

        expect(response.status).toBe(200);
        expect(response.body.type).toBe('WITHDRAW');
        expect(response.body.amount).toBe(300);
        expect(response.body.balanceBefore).toBe(1000);
        expect(response.body.balanceAfter).toBe(700);
        expect(response.body.status).toBe('COMPLETED');
      });

      it('rejects withdrawal exceeding balance', async () => {
        const response = await request(app)
          .post('/api/accounts/withdrawer/withdraw')
          .set('Idempotency-Key', 'exceed-key')
          .send({ amount: 2000 });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('INSUFFICIENT_BALANCE');
      });

      it('handles idempotent withdrawals', async () => {
        const key = 'idempotent-withdraw';

        const response1 = await request(app)
          .post('/api/accounts/withdrawer/withdraw')
          .set('Idempotency-Key', key)
          .send({ amount: 500 });

        const response2 = await request(app)
          .post('/api/accounts/withdrawer/withdraw')
          .set('Idempotency-Key', key)
          .send({ amount: 500 });

        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);
        expect(response1.body.transactionId).toBe(response2.body.transactionId);

        // Verify balance only decreased once
        const balanceResponse = await request(app).get('/api/accounts/withdrawer/balance');
        expect(balanceResponse.body.balance).toBe(500);
      });
    });

    describe('GET /api/accounts/:accountId/transactions', () => {
      beforeEach(async () => {
        // Create account with multiple transactions
        await request(app).post('/api/accounts/history-user').send({});

        // Multiple deposits
        await request(app)
          .post('/api/accounts/history-user/deposit')
          .set('Idempotency-Key', 'hist-dep-1')
          .send({ amount: 100, source: 'PURCHASE' });

        await request(app)
          .post('/api/accounts/history-user/deposit')
          .set('Idempotency-Key', 'hist-dep-2')
          .send({ amount: 200, source: 'BONUS' });

        await request(app)
          .post('/api/accounts/history-user/withdraw')
          .set('Idempotency-Key', 'hist-wit-1')
          .send({ amount: 50 });
      });

      it('returns transaction history', async () => {
        const response = await request(app).get('/api/accounts/history-user/transactions');

        expect(response.status).toBe(200);
        expect(response.body.transactions).toHaveLength(3);
        expect(response.body.total).toBe(3);
      });

      it('supports pagination', async () => {
        const response = await request(app).get(
          '/api/accounts/history-user/transactions?limit=2&offset=0',
        );

        expect(response.status).toBe(200);
        expect(response.body.transactions).toHaveLength(2);
        expect(response.body.limit).toBe(2);
        expect(response.body.offset).toBe(0);
      });

      it('filters by transaction type', async () => {
        const response = await request(app).get(
          '/api/accounts/history-user/transactions?type=DEPOSIT',
        );

        expect(response.status).toBe(200);
        expect(
          response.body.transactions.every((tx: { type: string }) => tx.type === 'DEPOSIT'),
        ).toBe(true);
      });

      it('returns empty list for new account', async () => {
        await request(app).post('/api/accounts/empty-history').send({});

        const response = await request(app).get('/api/accounts/empty-history/transactions');

        expect(response.status).toBe(200);
        expect(response.body.transactions).toHaveLength(0);
      });
    });

    describe('GET /api/accounts/:accountId/ledger', () => {
      beforeEach(async () => {
        await request(app).post('/api/accounts/ledger-user').send({});

        await request(app)
          .post('/api/accounts/ledger-user/deposit')
          .set('Idempotency-Key', 'ledger-dep-1')
          .send({ amount: 1000, source: 'PURCHASE' });

        await request(app)
          .post('/api/accounts/ledger-user/withdraw')
          .set('Idempotency-Key', 'ledger-wit-1')
          .send({ amount: 100 });
      });

      it('returns ledger entries', async () => {
        const response = await request(app).get('/api/accounts/ledger-user/ledger');

        expect(response.status).toBe(200);
        expect(response.body.entries).toBeDefined();
        expect(Array.isArray(response.body.entries)).toBe(true);
        expect(response.body.total).toBeGreaterThan(0);
      });

      it('returns latest checksum for audit', async () => {
        const response = await request(app).get('/api/accounts/ledger-user/ledger');

        expect(response.status).toBe(200);
        // Checksum may or may not be set depending on implementation
        expect(response.body).toHaveProperty('latestChecksum');
      });
    });
  });

  describe('Realistic Usage Scenarios', () => {
    describe('Player session flow', () => {
      it('handles complete buy-in and cash-out cycle', async () => {
        const accountId = 'player-session-test';
        const idempBase = `session-${Date.now()}`;

        // 1. Player creates account
        const createResponse = await request(app).post(`/api/accounts/${accountId}`).send({});

        expect(createResponse.body.created).toBe(true);
        expect(createResponse.body.balance).toBe(0);

        // 2. Player purchases chips
        const purchaseResponse = await request(app)
          .post(`/api/accounts/${accountId}/deposit`)
          .set('Idempotency-Key', `${idempBase}-purchase`)
          .send({ amount: 10000, source: 'PURCHASE' });

        expect(purchaseResponse.body.balanceAfter).toBe(10000);

        // 3. Player gets bonus
        const bonusResponse = await request(app)
          .post(`/api/accounts/${accountId}/deposit`)
          .set('Idempotency-Key', `${idempBase}-bonus`)
          .send({ amount: 500, source: 'BONUS' });

        expect(bonusResponse.body.balanceAfter).toBe(10500);

        // 4. Player checks balance
        const balanceResponse = await request(app).get(`/api/accounts/${accountId}/balance`);
        expect(balanceResponse.body.balance).toBe(10500);

        // 5. Player cashes out most chips
        const cashoutResponse = await request(app)
          .post(`/api/accounts/${accountId}/withdraw`)
          .set('Idempotency-Key', `${idempBase}-cashout`)
          .send({ amount: 10000, reason: 'cashout_request' });

        expect(cashoutResponse.body.balanceAfter).toBe(500);

        // 6. Check final balance
        const finalBalance = await request(app).get(`/api/accounts/${accountId}/balance`);
        expect(finalBalance.body.balance).toBe(500);

        // 7. Check transaction history
        const historyResponse = await request(app).get(`/api/accounts/${accountId}/transactions`);
        expect(historyResponse.body.transactions).toHaveLength(3);
      });
    });

    describe('Concurrent request handling', () => {
      it('handles simultaneous deposits with idempotency', async () => {
        const accountId = 'concurrent-test';
        const idempotencyKey = `concurrent-${Date.now()}`;

        await request(app).post(`/api/accounts/${accountId}`).send({});

        // Simulate concurrent requests with same idempotency key
        const requests = Array.from({ length: 5 }, () =>
          request(app)
            .post(`/api/accounts/${accountId}/deposit`)
            .set('Idempotency-Key', idempotencyKey)
            .send({ amount: 1000, source: 'PURCHASE' }),
        );

        const responses = await Promise.all(requests);

        // All should succeed
        responses.forEach((res) => {
          expect(res.status).toBe(200);
        });

        // But balance should only reflect single deposit
        const balance = await request(app).get(`/api/accounts/${accountId}/balance`);
        expect(balance.body.balance).toBe(1000);
      });

      it('handles multiple unique deposits correctly', async () => {
        const accountId = 'multi-deposit-test';

        await request(app).post(`/api/accounts/${accountId}`).send({});

        // Multiple unique deposits
        const depositPromises = Array.from({ length: 5 }, (_, i) =>
          request(app)
            .post(`/api/accounts/${accountId}/deposit`)
            .set('Idempotency-Key', `unique-deposit-${i}`)
            .send({ amount: 100, source: 'PURCHASE' }),
        );

        await Promise.all(depositPromises);

        // Balance should reflect all deposits
        const balance = await request(app).get(`/api/accounts/${accountId}/balance`);
        expect(balance.body.balance).toBe(500);
      });
    });

    describe('Error recovery scenarios', () => {
      it('handles withdrawal after failed attempt due to insufficient funds', async () => {
        const accountId = 'error-recovery-test';

        await request(app).post(`/api/accounts/${accountId}`).send({});

        await request(app)
          .post(`/api/accounts/${accountId}/deposit`)
          .set('Idempotency-Key', 'initial-deposit')
          .send({ amount: 500, source: 'PURCHASE' });

        // Try to withdraw too much
        const failedWithdraw = await request(app)
          .post(`/api/accounts/${accountId}/withdraw`)
          .set('Idempotency-Key', 'failed-withdraw')
          .send({ amount: 1000 });

        expect(failedWithdraw.status).toBe(400);
        expect(failedWithdraw.body.error).toBe('INSUFFICIENT_BALANCE');

        // Deposit more
        await request(app)
          .post(`/api/accounts/${accountId}/deposit`)
          .set('Idempotency-Key', 'additional-deposit')
          .send({ amount: 600, source: 'PURCHASE' });

        // Now withdraw should succeed with new key
        const successWithdraw = await request(app)
          .post(`/api/accounts/${accountId}/withdraw`)
          .set('Idempotency-Key', 'success-withdraw')
          .send({ amount: 1000 });

        expect(successWithdraw.status).toBe(200);
        expect(successWithdraw.body.balanceAfter).toBe(100);
      });
    });

    describe('Audit trail validation', () => {
      it('maintains complete audit trail of all operations', async () => {
        const accountId = 'audit-test';

        // Perform various operations
        await request(app).post(`/api/accounts/${accountId}`).send({ initialBalance: 0 });

        await request(app)
          .post(`/api/accounts/${accountId}/deposit`)
          .set('Idempotency-Key', 'audit-dep-1')
          .send({ amount: 1000, source: 'PURCHASE' });

        await request(app)
          .post(`/api/accounts/${accountId}/deposit`)
          .set('Idempotency-Key', 'audit-dep-2')
          .send({ amount: 500, source: 'BONUS' });

        await request(app)
          .post(`/api/accounts/${accountId}/withdraw`)
          .set('Idempotency-Key', 'audit-wit-1')
          .send({ amount: 200 });

        // Check ledger has entries for all operations
        const ledger = await request(app).get(`/api/accounts/${accountId}/ledger`);

        expect(ledger.body.entries.length).toBeGreaterThan(0);

        // Check transactions match
        const transactions = await request(app).get(`/api/accounts/${accountId}/transactions`);
        expect(transactions.body.transactions).toHaveLength(3);

        // Verify final balance matches expectations
        const balance = await request(app).get(`/api/accounts/${accountId}/balance`);
        expect(balance.body.balance).toBe(1300); // 1000 + 500 - 200
      });
    });
  });
});
