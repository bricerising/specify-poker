import type { Result } from '../result';
import { err, ok } from '../result';

export type UnaryClientCallback<Response, CallbackError extends Error = Error> = (
  error: CallbackError | null,
  response: Response,
) => void;

export type UnaryClientMethod<Request, Response, CallbackError extends Error = Error> = (
  request: Request,
  callback: UnaryClientCallback<Response, CallbackError>,
) => unknown;

export type UnaryCallOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type CancelableCall = { cancel: () => void };

export function unaryCall<Request, Response, CallbackError extends Error = Error>(
  method: UnaryClientMethod<Request, Response, CallbackError>,
  request: Request,
  options: UnaryCallOptions = {},
): Promise<Response> {
  const { signal, timeoutMs } = options;
  const hasTimeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0;

  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let call: unknown;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const settle = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      action();
    };

    const onAbort = () => {
      if (settled) {
        return;
      }
      if (isCancelableCall(call)) {
        call.cancel();
      }
      settle(() => reject(createAbortError()));
    };

    signal?.addEventListener('abort', onAbort);

    if (hasTimeout) {
      timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        if (isCancelableCall(call)) {
          call.cancel();
        }
        settle(() => reject(createAbortError(`Timed out after ${timeoutMs}ms`)));
      }, timeoutMs);
    }

    try {
      call = method(request, (error, response) => {
        if (error) {
          settle(() => reject(error));
          return;
        }
        settle(() => resolve(response));
      });
    } catch (error: unknown) {
      settle(() => reject(error));
    }
  });
}

export type UnaryCallResult<T> = Result<T, unknown>;

export async function unaryCallResult<Request, Response, CallbackError extends Error = Error>(
  method: UnaryClientMethod<Request, Response, CallbackError>,
  request: Request,
  options?: UnaryCallOptions,
): Promise<UnaryCallResult<Response>> {
  try {
    return ok(await unaryCall(method, request, options));
  } catch (error: unknown) {
    return err(error);
  }
}

function isCancelableCall(value: unknown): value is CancelableCall {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return 'cancel' in value && typeof (value as { cancel?: unknown }).cancel === 'function';
}

function createAbortError(message = 'Aborted'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
