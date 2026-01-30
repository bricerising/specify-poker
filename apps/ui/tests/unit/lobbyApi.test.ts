import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../src/services/apiClient';
import { createLobbyApi } from '../../src/services/lobbyApi';

describe('lobbyApi', () => {
  it('lists and decodes tables', async () => {
    const client: ApiClient = {
      fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as ApiClient['fetch'],
      fetchDecoded: vi.fn(async (_path, decode) => {
        return decode([
          {
            tableId: 'table-1',
            name: 'Home Game',
            ownerId: 'owner-1',
            config: {
              smallBlind: 5,
              bigBlind: 10,
              maxPlayers: 6,
              startingStack: 200,
            },
            seatsTaken: 2,
            occupiedSeatIds: [0, 3],
            inProgress: false,
            spectatorCount: 1,
          },
        ]);
      }) as unknown as ApiClient['fetchDecoded'],
    };

    const lobbyApi = createLobbyApi(client);
    await expect(lobbyApi.listTables()).resolves.toMatchObject([
      {
        tableId: 'table-1',
        name: 'Home Game',
        ownerId: 'owner-1',
        seatsTaken: 2,
        occupiedSeatIds: [0, 3],
        inProgress: false,
        spectatorCount: 1,
        config: {
          smallBlind: 5,
          bigBlind: 10,
          maxPlayers: 6,
          startingStack: 200,
          bettingStructure: 'NoLimit',
        },
      },
    ]);
  });

  it('creates a table with the expected payload', async () => {
    const fetchDecoded = vi.fn(async (_path, decode) => {
      return decode({
        tableId: 'table-2',
        name: 'New Table',
        ownerId: 'owner-2',
        config: { smallBlind: 1, bigBlind: 2, maxPlayers: 9, startingStack: 300 },
        seatsTaken: 0,
        occupiedSeatIds: [],
        inProgress: false,
        spectatorCount: 0,
      });
    });

    const client: ApiClient = {
      fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as ApiClient['fetch'],
      fetchDecoded: fetchDecoded as unknown as ApiClient['fetchDecoded'],
    };

    const lobbyApi = createLobbyApi(client);
    await lobbyApi.createTable({
      name: 'New Table',
      smallBlind: 1,
      bigBlind: 2,
      maxPlayers: 9,
      startingStack: 300,
    });

    expect(fetchDecoded).toHaveBeenCalledTimes(1);
    const [path, _decode, options] = fetchDecoded.mock.calls[0] ?? [];
    expect(path).toBe('/api/tables');

    expect(options).toMatchObject({ method: 'POST' });
    const body = (options as RequestInit).body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toEqual({
      name: 'New Table',
      config: {
        smallBlind: 1,
        bigBlind: 2,
        maxPlayers: 9,
        startingStack: 300,
      },
    });
  });
});
