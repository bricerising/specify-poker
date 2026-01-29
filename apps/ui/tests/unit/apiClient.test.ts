import { describe, expect, it, vi } from 'vitest';

import { ApiError, createApiClient } from '../../src/services/apiClient';

function createNow(start = 0, step = 10) {
  let value = start;
  return () => {
    value += step;
    return value;
  };
}

describe('apiClient', () => {
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
});
