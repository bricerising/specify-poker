import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../src/services/apiClient';
import { createProfileApi } from '../../src/services/profileApi';

describe('profileApi', () => {
  it('decodes /api/me payloads', async () => {
    const client: ApiClient = {
      fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as ApiClient['fetch'],
      fetchDecoded: vi.fn(async (_path, decode) => {
        return decode({
          userId: 'user-1',
          username: 'alice',
          avatarUrl: null,
          stats: { handsPlayed: 5, wins: 2 },
          friends: ['bob', 'carol'],
        });
      }) as unknown as ApiClient['fetchDecoded'],
    };

    const profileApi = createProfileApi(client);
    await expect(profileApi.fetchProfile()).resolves.toMatchObject({
      userId: 'user-1',
      username: 'alice',
      avatarUrl: null,
      stats: { handsPlayed: 5, wins: 2 },
      friends: ['bob', 'carol'],
    });
  });

  it('updates profile with JSON payload', async () => {
    const fetchDecoded = vi.fn(async (_path, decode) => {
      return decode({
        userId: 'user-1',
        username: 'alice',
        avatarUrl: 'https://example.test/avatar.png',
        stats: { handsPlayed: 0, wins: 0 },
        friends: [],
      });
    });

    const client: ApiClient = {
      fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as ApiClient['fetch'],
      fetchDecoded: fetchDecoded as unknown as ApiClient['fetchDecoded'],
    };

    const profileApi = createProfileApi(client);
    await profileApi.updateProfile({ avatarUrl: 'https://example.test/avatar.png' });

    expect(fetchDecoded).toHaveBeenCalledTimes(1);
    const [path, _decode, options] = fetchDecoded.mock.calls[0] ?? [];
    expect(path).toBe('/api/me');
    expect(options).toMatchObject({ method: 'PUT' });

    const body = (options as RequestInit).body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toEqual({ avatarUrl: 'https://example.test/avatar.png' });
  });
});
