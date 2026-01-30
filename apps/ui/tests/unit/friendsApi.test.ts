import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../src/services/apiClient';
import { createFriendsApi } from '../../src/services/friendsApi';

describe('friendsApi', () => {
  it('decodes friends lists', async () => {
    const client: ApiClient = {
      fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as ApiClient['fetch'],
      fetchDecoded: vi.fn(async (_path, decode) => {
        return decode({ friends: ['alice', 'bob'] });
      }) as unknown as ApiClient['fetchDecoded'],
    };

    const friendsApi = createFriendsApi(client);
    await expect(friendsApi.fetchFriends()).resolves.toEqual(['alice', 'bob']);
  });

  it('updates friends with JSON payload', async () => {
    const fetchDecoded = vi.fn(async (_path, decode) => {
      return decode({ friends: ['alice', 'bob'] });
    });

    const client: ApiClient = {
      fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as ApiClient['fetch'],
      fetchDecoded: fetchDecoded as unknown as ApiClient['fetchDecoded'],
    };

    const friendsApi = createFriendsApi(client);
    await friendsApi.updateFriends(['alice', 'bob']);

    expect(fetchDecoded).toHaveBeenCalledTimes(1);
    const [path, _decode, options] = fetchDecoded.mock.calls[0] ?? [];
    expect(path).toBe('/api/friends');
    expect(options).toMatchObject({ method: 'PUT' });

    const body = (options as RequestInit).body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toEqual({ friends: ['alice', 'bob'] });
  });
});
