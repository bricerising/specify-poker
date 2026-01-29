import { getToken } from './auth';
import { recordApiCall, recordError } from '../observability/otel';
import { asRecord, readTrimmedString } from '../utils/unknown';

const DEFAULT_BASE_URL = 'http://localhost:4000';

export function getApiBaseUrl() {
  return (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ ?? DEFAULT_BASE_URL;
}

async function readUnknownBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

function formatErrorMessage(status: number, body: unknown): string {
  const bodyText = readTrimmedString(body);
  if (bodyText) {
    return bodyText;
  }

  const record = asRecord(body);
  if (record) {
    const message = readTrimmedString(record.message);
    if (message) {
      return message;
    }

    const error = readTrimmedString(record.error);
    if (error) {
      return error;
    }
  }

  return `API error ${status}`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly method: string;
  readonly body: unknown;

  constructor(params: { status: number; url: string; method: string; body: unknown }) {
    super(formatErrorMessage(params.status, params.body));
    this.name = 'ApiError';
    this.status = params.status;
    this.url = params.url;
    this.method = params.method;
    this.body = params.body;
  }
}

type ApiClientDeps = {
  readonly fetch: typeof fetch;
  readonly getBaseUrl: () => string;
  readonly getToken: () => string | null;
  readonly now: () => number;
  readonly recordApiCall: typeof recordApiCall;
  readonly recordError: typeof recordError;
};

export type ApiClient = {
  fetch(path: string, options?: RequestInit): Promise<Response>;
  fetchDecoded<T>(path: string, decode: (payload: unknown) => T, options?: RequestInit): Promise<T>;
};

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const apiFetch: ApiClient['fetch'] = async (path, options = {}) => {
    const token = deps.getToken();
    const headers = new Headers(options.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const method = options.method ?? 'GET';
    const endpoint = `${deps.getBaseUrl()}${path}`;
    const startedAt = deps.now();

    let response: Response;
    try {
      response = await deps.fetch(endpoint, {
        ...options,
        headers,
        method,
      });
    } catch (error) {
      deps.recordApiCall(endpoint, method, undefined, deps.now() - startedAt);
      if (error instanceof Error) {
        deps.recordError(error, { 'http.url': endpoint, 'http.method': method });
      }
      throw error;
    }

    deps.recordApiCall(endpoint, method, response.status, deps.now() - startedAt);

    if (!response.ok) {
      const body = await readUnknownBody(response);
      throw new ApiError({ status: response.status, url: endpoint, method, body });
    }

    return response;
  };

  const apiFetchDecoded: ApiClient['fetchDecoded'] = async (path, decode, options = {}) => {
    const response = await apiFetch(path, options);
    return decode((await response.json()) as unknown);
  };

  return {
    fetch: apiFetch,
    fetchDecoded: apiFetchDecoded,
  };
}

export const api = createApiClient({
  fetch,
  getBaseUrl: getApiBaseUrl,
  getToken,
  now: () => Date.now(),
  recordApiCall,
  recordError,
});

export const apiFetch: ApiClient['fetch'] = (...args) => api.fetch(...args);

export const apiFetchDecoded: ApiClient['fetchDecoded'] = (...args) => api.fetchDecoded(...args);
