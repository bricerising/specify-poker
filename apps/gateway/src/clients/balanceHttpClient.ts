import { err, ok, type Result } from '@specify-poker/shared';

import { getConfig } from '../config';
import { toHttpUrl } from '../utils/httpUrl';

export type BalanceDepositError =
  | { type: 'aborted'; message: string }
  | { type: 'fetch_error'; message: string }
  | { type: 'non_ok_response'; status: number; bodyText: string };

export type BalanceHttpClient = {
  deposit(params: {
    accountId: string;
    amount: number;
    source: string;
    idempotencyKey: string;
    gatewayUserId: string;
    bearerToken?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<Result<void, BalanceDepositError>>;
};

type BalanceHttpClientDeps = {
  getConfig: typeof getConfig;
  fetch: typeof fetch;
  defaultTimeoutMs: number;
};

function getBalanceServiceBaseUrl(deps: Pick<BalanceHttpClientDeps, 'getConfig'>): string {
  const config = deps.getConfig();
  return toHttpUrl(config.balanceServiceHttpUrl);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  return 'unknown';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function createBalanceHttpClient(
  overrides: Partial<BalanceHttpClientDeps> = {},
): BalanceHttpClient {
  const deps: BalanceHttpClientDeps = {
    getConfig: overrides.getConfig ?? getConfig,
    fetch: overrides.fetch ?? fetch,
    defaultTimeoutMs: overrides.defaultTimeoutMs ?? 2_000,
  };

  async function deposit(params: {
    accountId: string;
    amount: number;
    source: string;
    idempotencyKey: string;
    gatewayUserId: string;
    bearerToken?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<Result<void, BalanceDepositError>> {
    const timeoutMs = params.timeoutMs ?? deps.defaultTimeoutMs;
    const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    const timeoutId = hasTimeout ? setTimeout(() => controller.abort(), timeoutMs) : null;

    params.signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const baseUrl = getBalanceServiceBaseUrl(deps);
      const url = new URL(`/api/accounts/${encodeURIComponent(params.accountId)}/deposit`, baseUrl);

      const response = await deps.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': params.idempotencyKey,
          'x-gateway-user-id': params.gatewayUserId,
          'x-user-id': params.gatewayUserId,
          ...(params.bearerToken ? { Authorization: `Bearer ${params.bearerToken}` } : {}),
        },
        body: JSON.stringify({ amount: params.amount, source: params.source }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        return err({ type: 'non_ok_response', status: response.status, bodyText });
      }

      return ok(undefined);
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return err({ type: 'aborted', message: getErrorMessage(error) });
      }

      return err({ type: 'fetch_error', message: getErrorMessage(error) });
    } finally {
      params.signal?.removeEventListener('abort', abortFromCaller);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  return { deposit };
}
