import { expect, test } from '@playwright/test';
import crypto from 'crypto';
import { generateToken } from './helpers/auth';
import { urls } from './helpers/urls';
import { authHeaders } from './helpers/http';

type TableResponse = { table_id?: string; tableId?: string; name?: string };

function readTableId(value: TableResponse): string {
  if (typeof value.table_id === 'string' && value.table_id.trim().length > 0) {
    return value.table_id;
  }
  if (typeof value.tableId === 'string' && value.tableId.trim().length > 0) {
    return value.tableId;
  }
  throw new Error('Missing table id in response');
}

function readAvailableBalance(value: unknown): number {
  if (!value || typeof value !== 'object') {
    throw new Error('Missing balance response');
  }
  const record = value as Record<string, unknown>;
  const raw = record.availableBalance;
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error('Missing availableBalance in response');
}

test.describe('Idempotency (Gateway -> gRPC)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'API-only checks run once.');
  test.setTimeout(30_000);

  test('CreateTable returns the same table for duplicate Idempotency-Key', async ({ request }) => {
    const runId = crypto.randomUUID().slice(0, 6);
    const userId = `user-idem-${runId}`;
    const token = generateToken(userId, `Idem${runId}`);
    const tableName = `Idempotent Create ${runId}`;

    const createKey = `create-${crypto.randomUUID()}`;
    const createPayload = {
      name: tableName,
      config: {
        smallBlind: 1,
        bigBlind: 2,
        maxPlayers: 6,
        startingStack: 200,
      },
    };

    const [firstCreate, secondCreate] = await Promise.all([
      request.post(`${urls.gateway}/api/tables`, {
        headers: {
          ...authHeaders(token),
          'Content-Type': 'application/json',
          'Idempotency-Key': createKey,
        },
        data: createPayload,
      }),
      request.post(`${urls.gateway}/api/tables`, {
        headers: {
          ...authHeaders(token),
          'Content-Type': 'application/json',
          'Idempotency-Key': createKey,
        },
        data: createPayload,
      }),
    ]);
    expect(firstCreate.status()).toBe(201);
    expect(secondCreate.status()).toBe(201);

    const [firstBody, secondBody] = await Promise.all([
      firstCreate.json() as Promise<TableResponse>,
      secondCreate.json() as Promise<TableResponse>,
    ]);
    const tableId1 = readTableId(firstBody);
    const tableId2 = readTableId(secondBody);

    expect(tableId1).toBe(tableId2);

    const tablesResponse = await request.get(`${urls.gateway}/api/tables`, {
      headers: authHeaders(token),
    });
    expect(tablesResponse.ok()).toBeTruthy();
    const tables = (await tablesResponse.json()) as TableResponse[];
    expect(tables.filter((table) => table.name === tableName)).toHaveLength(1);

    const cleanup = await request.delete(`${urls.gateway}/api/tables/${tableId1}`, {
      headers: { ...authHeaders(token), 'Idempotency-Key': `cleanup-${crypto.randomUUID()}` },
    });
    expect(cleanup.status()).toBe(204);
  });

  test('DeleteTable is idempotent for duplicate Idempotency-Key', async ({ request }) => {
    const runId = crypto.randomUUID().slice(0, 6);
    const userId = `user-idem-del-${runId}`;
    const token = generateToken(userId, `IdemDel${runId}`);
    const tableName = `Idempotent Delete ${runId}`;

    const create = await request.post(`${urls.gateway}/api/tables`, {
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/json',
        'Idempotency-Key': `create-${crypto.randomUUID()}`,
      },
      data: {
        name: tableName,
        config: {
          smallBlind: 1,
          bigBlind: 2,
          maxPlayers: 6,
          startingStack: 200,
        },
      },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()) as TableResponse;
    const tableId = readTableId(created);

    const deleteKey = `delete-${crypto.randomUUID()}`;

    const [firstDelete, secondDelete] = await Promise.all([
      request.delete(`${urls.gateway}/api/tables/${tableId}`, {
        headers: { ...authHeaders(token), 'Idempotency-Key': deleteKey },
      }),
      request.delete(`${urls.gateway}/api/tables/${tableId}`, {
        headers: { ...authHeaders(token), 'Idempotency-Key': deleteKey },
      }),
    ]);
    expect(firstDelete.status()).toBe(204);
    expect(secondDelete.status()).toBe(204);

    const tablesResponse = await request.get(`${urls.gateway}/api/tables`, {
      headers: authHeaders(token),
    });
    expect(tablesResponse.ok()).toBeTruthy();
    const tables = (await tablesResponse.json()) as TableResponse[];
    expect(tables.filter((table) => table.name === tableName)).toHaveLength(0);
  });

  test('JoinSeat does not double-charge for duplicate Idempotency-Key', async ({ request }) => {
    const runId = crypto.randomUUID().slice(0, 6);

    const ownerId = `user-idem-owner-${runId}`;
    const ownerToken = generateToken(ownerId, `IdemOwner${runId}`);
    const tableName = `Idempotent JoinSeat ${runId}`;

    const playerId = `user-idem-player-${runId}`;
    const playerToken = generateToken(playerId, `IdemPlayer${runId}`);

    const ensureAccount = await request.post(`${urls.balance}/api/accounts/${playerId}`, {
      headers: { ...authHeaders(playerToken), 'Content-Type': 'application/json' },
      data: { initialBalance: 0 },
    });
    expect([200, 201]).toContain(ensureAccount.status());

    const initialDeposit = 2000;
    const deposit = await request.post(`${urls.balance}/api/accounts/${playerId}/deposit`, {
      headers: {
        ...authHeaders(playerToken),
        'Content-Type': 'application/json',
        'Idempotency-Key': `deposit-${crypto.randomUUID()}`,
      },
      data: { amount: initialDeposit, source: 'FREEROLL' },
    });
    expect(deposit.ok()).toBeTruthy();

    const beforeBalance = await request.get(`${urls.balance}/api/accounts/${playerId}/balance`, {
      headers: authHeaders(playerToken),
    });
    expect(beforeBalance.ok()).toBeTruthy();
    const beforeAvailable = readAvailableBalance(await beforeBalance.json());

    const createTable = await request.post(`${urls.gateway}/api/tables`, {
      headers: {
        ...authHeaders(ownerToken),
        'Content-Type': 'application/json',
        'Idempotency-Key': `create-${crypto.randomUUID()}`,
      },
      data: {
        name: tableName,
        config: {
          smallBlind: 1,
          bigBlind: 2,
          maxPlayers: 6,
          startingStack: 200,
        },
      },
    });
    expect(createTable.status()).toBe(201);
    const createdTable = (await createTable.json()) as TableResponse;
    const tableId = readTableId(createdTable);

    const buyInAmount = 200;
    const joinKey = `join-${crypto.randomUUID()}`;

    const [firstJoin, secondJoin] = await Promise.all([
      request.post(`${urls.gateway}/api/tables/${tableId}/join`, {
        headers: {
          ...authHeaders(playerToken),
          'Content-Type': 'application/json',
          'Idempotency-Key': joinKey,
        },
        data: { seatId: 0, buyInAmount },
      }),
      request.post(`${urls.gateway}/api/tables/${tableId}/join`, {
        headers: {
          ...authHeaders(playerToken),
          'Content-Type': 'application/json',
          'Idempotency-Key': joinKey,
        },
        data: { seatId: 0, buyInAmount },
      }),
    ]);
    expect(firstJoin.ok()).toBeTruthy();
    expect(secondJoin.ok()).toBeTruthy();

    const afterBalance = await request.get(`${urls.balance}/api/accounts/${playerId}/balance`, {
      headers: authHeaders(playerToken),
    });
    expect(afterBalance.ok()).toBeTruthy();
    const afterAvailable = readAvailableBalance(await afterBalance.json());
    expect(afterAvailable).toBe(beforeAvailable - buyInAmount);

    const cleanup = await request.delete(`${urls.gateway}/api/tables/${tableId}`, {
      headers: { ...authHeaders(ownerToken), 'Idempotency-Key': `cleanup-${crypto.randomUUID()}` },
    });
    expect(cleanup.status()).toBe(204);
  });
});
