import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../src/services/apiClient';
import { createPushClient } from '../../src/services/pushClient';

describe('pushClient', () => {
  it('registers subscriptions via POST', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const client: ApiClient = {
      fetch: fetch as unknown as ApiClient['fetch'],
      fetchDecoded: vi.fn() as unknown as ApiClient['fetchDecoded'],
    };
    const pushClient = createPushClient(client);

    await pushClient.registerPushSubscription({ endpoint: 'https://example.test/push' });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, options] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/api/push/subscribe');
    expect(options).toMatchObject({ method: 'POST' });

    const body = (options as RequestInit).body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toEqual({ endpoint: 'https://example.test/push' });
  });

  it('unregisters subscriptions via DELETE with body', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const client: ApiClient = {
      fetch: fetch as unknown as ApiClient['fetch'],
      fetchDecoded: vi.fn() as unknown as ApiClient['fetchDecoded'],
    };
    const pushClient = createPushClient(client);

    await pushClient.unregisterPushSubscription('https://example.test/push');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, options] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/api/push/subscribe');
    expect(options).toMatchObject({ method: 'DELETE' });

    const body = (options as RequestInit).body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toEqual({ endpoint: 'https://example.test/push' });
  });
});
