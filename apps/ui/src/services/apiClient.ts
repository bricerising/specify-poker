import { getToken } from './auth';
import { recordApiCall, recordError } from '../observability/otel';

const DEFAULT_BASE_URL = 'http://localhost:4000';

export function getApiBaseUrl() {
  return (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ ?? DEFAULT_BASE_URL;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const method = options.method ?? 'GET';
  const endpoint = `${getApiBaseUrl()}${path}`;
  const startedAt = Date.now();
  let response: Response;

  try {
    response = await fetch(endpoint, {
      ...options,
      headers,
      method,
    });
  } catch (error) {
    recordApiCall(endpoint, method, undefined, Date.now() - startedAt);
    if (error instanceof Error) {
      recordError(error, { 'http.url': endpoint, 'http.method': method });
    }
    throw error;
  }

  recordApiCall(endpoint, method, response.status, Date.now() - startedAt);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message ?? `API error ${response.status}`);
  }

  return response;
}
