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
};

type CancelableCall = { cancel: () => void };

export function unaryCall<Request, Response, CallbackError extends Error = Error>(
  method: UnaryClientMethod<Request, Response, CallbackError>,
  request: Request,
  options: UnaryCallOptions = {},
): Promise<Response> {
  const { signal } = options;

  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let call: unknown;

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
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

function createAbortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}
