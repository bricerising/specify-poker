import { getToken } from './auth';
import { recordApiCall, recordError } from '../observability/otel';
import { asRecord, readTrimmedString } from '../utils/unknown';

const DEFAULT_BASE_URL = 'http://localhost:4000';

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_BASE_URL;
  }
  return (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ ?? DEFAULT_BASE_URL;
}

function joinUrl(baseUrl: string, path: string): string {
  if (!path) {
    return baseUrl;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function readUnknownBody(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return null;
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
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

type RecordApiCall = (
  endpoint: string,
  method: string,
  statusCode?: number,
  durationMs?: number,
) => void;

type RecordError = (
  error: Error | string,
  context?: Record<string, string | number | boolean>,
) => void;

type ApiClientDeps = {
  readonly fetch: typeof fetch;
  readonly getBaseUrl: () => string;
  readonly getToken: () => string | null;
  readonly now: () => number;
  readonly recordApiCall: RecordApiCall;
  readonly recordError: RecordError;
};

export type ApiClient = {
  fetch(path: string, options?: RequestInit): Promise<Response>;
  fetchDecoded<T>(path: string, decode: (payload: unknown) => T, options?: RequestInit): Promise<T>;
};

type ApiClientFactory = () => ApiClient;

/**
 * Proxy pattern: lazily creates the real ApiClient on first use and then delegates.
 *
 * This keeps module initialization free of runtime/browsers globals while still
 * exposing a stable `ApiClient` object for call sites.
 */
export function createLazyApiClient(factory: ApiClientFactory): ApiClient {
  let client: ApiClient | null = null;

  const getClient = () => {
    if (!client) {
      client = factory();
    }
    return client;
  };

  return {
    fetch: (path, options) => getClient().fetch(path, options),
    fetchDecoded: (path, decode, options) => getClient().fetchDecoded(path, decode, options),
  };
}

type ApiRequestInit = Omit<RequestInit, 'headers' | 'method'>;

type ApiRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly init: ApiRequestInit;
};

type ApiFetcher = (request: ApiRequest) => Promise<Response>;
type ApiFetcherDecorator = (next: ApiFetcher) => ApiFetcher;

type ApiCallMetrics = {
  readonly url: string;
  readonly method: string;
  readonly statusCode: number | undefined;
  readonly durationMs: number;
};

type ErrorTelemetryContext = Record<string, string | number | boolean>;

function createSafeRecordApiCall(
  record: ApiClientDeps['recordApiCall'],
): (metrics: ApiCallMetrics) => void {
  return (metrics) => {
    try {
      record(metrics.url, metrics.method, metrics.statusCode, metrics.durationMs);
    } catch {
      // Best-effort telemetry only.
    }
  };
}

function createSafeRecordError(
  record: ApiClientDeps['recordError'],
): (error: Error, context: ErrorTelemetryContext) => void {
  return (error, context) => {
    try {
      record(error, context);
    } catch {
      // Best-effort telemetry only.
    }
  };
}

function createTelemetryDecorator(params: {
  now: () => number;
  recordApiCall: (metrics: ApiCallMetrics) => void;
  recordError: (error: Error, context: ErrorTelemetryContext) => void;
}): ApiFetcherDecorator {
  return (next) => async (request) => {
    const startedAt = params.now();
    let statusCode: number | undefined;
    let caughtError: unknown;
    try {
      const response = await next(request);
      statusCode = response.status;
      return response;
    } catch (error) {
      caughtError = error;
      statusCode = error instanceof ApiError ? error.status : undefined;
      throw error;
    } finally {
      params.recordApiCall({
        url: request.url,
        method: request.method,
        statusCode,
        durationMs: params.now() - startedAt,
      });

      if (caughtError instanceof Error) {
        const shouldRecordError = statusCode === undefined || statusCode >= 500;
        if (shouldRecordError) {
          params.recordError(caughtError, {
            'http.url': request.url,
            'http.method': request.method,
            ...(statusCode !== undefined ? { 'http.status_code': statusCode } : {}),
            'api.phase': 'fetch',
          });
        }
      }
    }
  };
}

function createAuthHeaderDecorator(getTokenFromStorage: () => string | null): ApiFetcherDecorator {
  return (next) => async (request) => {
    const token = getTokenFromStorage();
    if (!token || request.headers.has('Authorization')) {
      return next(request);
    }

    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return next({ ...request, headers });
  };
}

function createEnsureOkResponseDecorator(): ApiFetcherDecorator {
  return (next) => async (request) => {
    const response = await next(request);
    if (!response.ok) {
      const body = await readUnknownBody(response);
      throw new ApiError({ status: response.status, url: request.url, method: request.method, body });
    }
    return response;
  };
}

function composeApiFetchers(
  decorators: readonly ApiFetcherDecorator[],
  terminal: ApiFetcher,
): ApiFetcher {
  return decorators.reduceRight<ApiFetcher>((next, decorator) => decorator(next), terminal);
}

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const safeRecordApiCall = createSafeRecordApiCall(deps.recordApiCall);
  const safeRecordError = createSafeRecordError(deps.recordError);

  const terminalFetch: ApiFetcher = async (request) => {
    return deps.fetch(request.url, {
      ...request.init,
      method: request.method,
      headers: request.headers,
    });
  };

  const fetchWithDecorators = composeApiFetchers(
    [
      createTelemetryDecorator({
        now: deps.now,
        recordApiCall: safeRecordApiCall,
        recordError: safeRecordError,
      }),
      createAuthHeaderDecorator(deps.getToken),
      createEnsureOkResponseDecorator(),
    ],
    terminalFetch,
  );

  const createRequest = (path: string, options: RequestInit = {}): ApiRequest => {
    const url = joinUrl(deps.getBaseUrl(), path);
    const { method: methodFromOptions, headers: headersFromOptions, ...init } = options;
    const method = (methodFromOptions ?? 'GET').toUpperCase();
    const headers = new Headers(headersFromOptions);

    return { url, method, headers, init };
  };

  const apiFetch: ApiClient['fetch'] = async (path, options = {}) => {
    const request = createRequest(path, options);
    return fetchWithDecorators(request);
  };

  const apiFetchDecoded: ApiClient['fetchDecoded'] = async (path, decode, options = {}) => {
    const request = createRequest(path, options);
    const response = await fetchWithDecorators(request);
    const payload = await readUnknownBody(response);

    try {
      return decode(payload);
    } catch (error) {
      if (error instanceof Error) {
        safeRecordError(error, {
          'http.url': request.url,
          'http.method': request.method,
          'api.phase': 'decode',
        });
      }
      throw error;
    }
  };

  return {
    fetch: apiFetch,
    fetchDecoded: apiFetchDecoded,
  };
}

function createDefaultApiClient(): ApiClient {
  return createApiClient({
    fetch: (input, init) => globalThis.fetch(input, init),
    getBaseUrl: getApiBaseUrl,
    getToken,
    now: () => globalThis.performance?.now?.() ?? Date.now(),
    recordApiCall,
    recordError,
  });
}

export const api = createLazyApiClient(createDefaultApiClient);

export const apiFetch: ApiClient['fetch'] = (...args) => api.fetch(...args);

export const apiFetchDecoded: ApiClient['fetchDecoded'] = (...args) => api.fetchDecoded(...args);
