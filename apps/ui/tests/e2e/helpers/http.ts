import type { APIRequestContext } from "@playwright/test";
import { urls } from "./urls";

export type AuthHeadersOptions = {
  forwardedFor?: string;
};

export function authHeaders(token: string, options: AuthHeadersOptions = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(options.forwardedFor ? { "X-Forwarded-For": options.forwardedFor } : {}),
  };
}

export async function expectHealthy(request: APIRequestContext) {
  const response = await request.get(`${urls.gateway}/ready`);
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Gateway not ready: ${response.status()} ${body}`);
  }
}

export async function gatewayJson<TResponse>(
  request: APIRequestContext,
  path: string,
  options: {
    token?: string;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    data?: unknown;
    forwardedFor?: string;
  } = {},
): Promise<TResponse> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    ...(options.token ? authHeaders(options.token, { forwardedFor: options.forwardedFor }) : {}),
    ...(options.data ? { "Content-Type": "application/json" } : {}),
  };

  const response = await request.fetch(`${urls.gateway}${path}`, {
    method,
    headers,
    data: options.data,
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Gateway request failed: ${method} ${path} -> ${response.status()} ${body}`);
  }

  return (await response.json()) as TResponse;
}

