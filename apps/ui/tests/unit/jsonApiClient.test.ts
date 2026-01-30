import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../../src/services/apiClient';
import { createJsonApiClient } from '../../src/services/jsonApiClient';

describe('jsonApiClient', () => {
  it('stringifies json payloads and sets content-type', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const client: ApiClient = {
      fetch: fetch as unknown as ApiClient['fetch'],
      fetchDecoded: vi.fn() as unknown as ApiClient['fetchDecoded'],
    };

    const jsonClient = createJsonApiClient(client);
    await jsonClient.request('/api/test', { method: 'POST', json: { value: 123 } });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, options] = fetch.mock.calls[0] ?? [];
    expect(path).toBe('/api/test');
    expect(options).toMatchObject({ method: 'POST' });

    const body = (options as RequestInit).body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toEqual({ value: 123 });

    const contentType = new Headers((options as RequestInit).headers).get('Content-Type');
    expect(contentType).toBe('application/json');
  });

  it('does not override an explicit content-type', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const client: ApiClient = {
      fetch: fetch as unknown as ApiClient['fetch'],
      fetchDecoded: vi.fn() as unknown as ApiClient['fetchDecoded'],
    };

    const jsonClient = createJsonApiClient(client);
    await jsonClient.request('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.api+json' },
      json: { value: 123 },
    });

    const [_path, options] = fetch.mock.calls[0] ?? [];
    const contentType = new Headers((options as RequestInit).headers).get('Content-Type');
    expect(contentType).toBe('application/vnd.api+json');
  });

  it('passes JSON bodies to fetchDecoded', async () => {
    const fetchDecoded = vi.fn(async (_path: string, decode: (payload: unknown) => unknown) => {
      return decode({ ok: true });
    });

    const client: ApiClient = {
      fetch: vi.fn() as unknown as ApiClient['fetch'],
      fetchDecoded: fetchDecoded as unknown as ApiClient['fetchDecoded'],
    };

    const jsonClient = createJsonApiClient(client);
    await expect(
      jsonClient.requestDecoded(
        '/api/test',
        (payload) => {
        const record = payload as { ok?: unknown };
        if (record.ok !== true) {
          throw new Error('invalid');
        }
        return record.ok;
        },
        { method: 'PUT', json: { hello: 'world' } },
      ),
    ).resolves.toBe(true);

    expect(fetchDecoded).toHaveBeenCalledTimes(1);
    const [path, _decode, options] = fetchDecoded.mock.calls[0] ?? [];
    expect(path).toBe('/api/test');
    expect(options).toMatchObject({ method: 'PUT' });

    const body = (options as RequestInit).body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toEqual({ hello: 'world' });
  });
});
