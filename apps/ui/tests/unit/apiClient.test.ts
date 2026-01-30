import { describe, expect, it, vi } from 'vitest';

import { ApiError, createApiClient, createLazyApiClient } from '../../src/services/apiClient';

function createNow(start = 0, step = 10) {
  let value = start;
  return () => {
    value += step;
    return value;
  };
}

describe('apiClient', () => {
  it('lazily creates the default client via proxy', async () => {
    const realClient = {
      fetch: vi.fn(async (_path: string, _options?: RequestInit) => new Response(null, { status: 200 })),
      fetchDecoded: vi.fn(
        async (_path: string, decode: (payload: unknown) => unknown, _options?: RequestInit) =>
          decode(null),
      ),
    };
    const factory = vi.fn(() => realClient);

    const client = createLazyApiClient(factory);

    expect(factory).toHaveBeenCalledTimes(0);

    await client.fetch('/api/test');
    await client.fetch('/api/test-again');
    await client.fetchDecoded('/api/decode', () => 'ok');

    expect(factory).toHaveBeenCalledTimes(1);
    expect(realClient.fetch).toHaveBeenCalledTimes(2);
    expect(realClient.fetchDecoded).toHaveBeenCalledTimes(1);
  });

  it('joins baseUrl and path safely', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const api = createApiClient({
      fetch: fetchMock as unknown as typeof fetch,
      getBaseUrl: () => 'http://example.test/',
      getToken: () => null,
      now: createNow(),
      recordApiCall: vi.fn(),
      recordError: vi.fn(),
    });

    await api.fetch('api/test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://example.test/api/test');
  });

  it('adds bearer token when present', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const api = createApiClient({
      fetch: fetchMock as unknown as typeof fetch,
      getBaseUrl: () => 'http://example.test',
      getToken: () => 'token-123',
      now: createNow(),
      recordApiCall: vi.fn(),
      recordError: vi.fn(),
    });

    await api.fetch('/api/test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://example.test/api/test');
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('throws ApiError with message from { error } response bodies', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'Bad request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const api = createApiClient({
      fetch: fetchMock as unknown as typeof fetch,
      getBaseUrl: () => 'http://example.test',
      getToken: () => null,
      now: createNow(),
      recordApiCall: vi.fn(),
      recordError: vi.fn(),
    });

    await expect(api.fetch('/api/test')).rejects.toBeInstanceOf(ApiError);
    await expect(api.fetch('/api/test')).rejects.toMatchObject({
      status: 400,
      message: 'Bad request',
    });
  });

  it('throws ApiError with message from text response bodies', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('Nope', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    });

    const api = createApiClient({
      fetch: fetchMock as unknown as typeof fetch,
      getBaseUrl: () => 'http://example.test',
      getToken: () => null,
      now: createNow(),
      recordApiCall: vi.fn(),
      recordError: vi.fn(),
    });

    await expect(api.fetch('/api/test')).rejects.toBeInstanceOf(ApiError);
    await expect(api.fetch('/api/test')).rejects.toMatchObject({
      status: 500,
      message: 'Nope',
    });
  });

  it('records ApiError status in telemetry (without logging 4xx errors)', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'Bad request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const recordApiCall = vi.fn();
    const recordError = vi.fn();

    const api = createApiClient({
      fetch: fetchMock as unknown as typeof fetch,
      getBaseUrl: () => 'http://example.test',
      getToken: () => null,
      now: createNow(),
      recordApiCall,
      recordError,
    });

    await expect(api.fetch('/api/test')).rejects.toBeInstanceOf(ApiError);

    expect(recordApiCall).toHaveBeenCalledTimes(1);
    expect(recordApiCall).toHaveBeenCalledWith('http://example.test/api/test', 'GET', 400, 10);
    expect(recordError).toHaveBeenCalledTimes(0);
  });

  it('records ApiError details as error telemetry for 5xx responses', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('Nope', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    });

    const recordApiCall = vi.fn();
    const recordError = vi.fn();

    const api = createApiClient({
      fetch: fetchMock as unknown as typeof fetch,
      getBaseUrl: () => 'http://example.test',
      getToken: () => null,
      now: createNow(),
      recordApiCall,
      recordError,
    });

    await expect(api.fetch('/api/test')).rejects.toBeInstanceOf(ApiError);

    expect(recordApiCall).toHaveBeenCalledTimes(1);
    expect(recordApiCall).toHaveBeenCalledWith('http://example.test/api/test', 'GET', 500, 10);
    expect(recordError).toHaveBeenCalledTimes(1);
    expect(recordError.mock.calls[0]?.[0]).toBeInstanceOf(ApiError);
    expect(recordError.mock.calls[0]?.[1]).toMatchObject({
      'http.url': 'http://example.test/api/test',
      'http.method': 'GET',
      'http.status_code': 500,
    });
  });

  it('decodes JSON via fetchDecoded', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ value: 123 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const api = createApiClient({
      fetch: fetchMock as unknown as typeof fetch,
      getBaseUrl: () => 'http://example.test',
      getToken: () => null,
      now: createNow(),
      recordApiCall: vi.fn(),
      recordError: vi.fn(),
    });

    const result = await api.fetchDecoded('/api/test', (payload) => {
      if (!payload || typeof payload !== 'object') {
        throw new Error('invalid');
      }
      const value = (payload as { value?: unknown }).value;
      if (typeof value !== 'number') {
        throw new Error('invalid');
      }
      return value;
    });

    expect(result).toBe(123);
  });

  it('decodes text via fetchDecoded', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('hello', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    });

    const api = createApiClient({
      fetch: fetchMock as unknown as typeof fetch,
      getBaseUrl: () => 'http://example.test',
      getToken: () => null,
      now: createNow(),
      recordApiCall: vi.fn(),
      recordError: vi.fn(),
    });

    const result = await api.fetchDecoded('/api/test', (payload) => {
      if (payload !== 'hello') {
        throw new Error('invalid');
      }
      return payload;
    });

    expect(result).toBe('hello');
  });
});
