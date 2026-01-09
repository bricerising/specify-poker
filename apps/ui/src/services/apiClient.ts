import { getToken } from "./auth";

const DEFAULT_BASE_URL = "http://localhost:4000";

export function getApiBaseUrl() {
  return (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ ?? DEFAULT_BASE_URL;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message ?? `API error ${response.status}`);
  }

  return response;
}
