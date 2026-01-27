import { ensureError } from "../errors/ensureError";

export type UnaryCall<Req> = { request: Req };

export type UnaryCallback<Res, CallbackError extends Error = Error> = (
  error: CallbackError | null,
  response?: Res
) => void;

export type UnaryContext<Req, _Res, Call extends UnaryCall<Req> = UnaryCall<Req>> = {
  request: Req;
  call: Call;
};

export type RequestHandler<Req, Res, Call extends UnaryCall<Req> = UnaryCall<Req>> = (
  context: UnaryContext<Req, Res, Call>
) => Promise<Res>;

export type UnaryInterceptor<Req, Res, Call extends UnaryCall<Req> = UnaryCall<Req>> = (
  context: UnaryContext<Req, Res, Call>,
  next: RequestHandler<Req, Res, Call>
) => Promise<Res>;

export function chainUnaryInterceptors<Req, Res, Call extends UnaryCall<Req>>(
  handler: RequestHandler<Req, Res, Call>,
  interceptors: ReadonlyArray<UnaryInterceptor<Req, Res, Call>>
): RequestHandler<Req, Res, Call> {
  return interceptors.reduceRight<RequestHandler<Req, Res, Call>>(
    (next, interceptor) => (context) => interceptor(context, next),
    handler
  );
}

export function withUnaryHooks<Req, Res, Call extends UnaryCall<Req>>(hooks?: {
  onSuccess?: (context: UnaryContext<Req, Res, Call>, response: Res) => void;
  onError?: (context: UnaryContext<Req, Res, Call>, error: unknown) => void;
}): UnaryInterceptor<Req, Res, Call> {
  return async (context, next) => {
    try {
      const response = await next(context);
      hooks?.onSuccess?.(context, response);
      return response;
    } catch (error: unknown) {
      hooks?.onError?.(context, error);
      throw error;
    }
  };
}

export function withUnaryTiming<Req, Res, Call extends UnaryCall<Req>>(options: {
  method: string;
  record: (method: string, status: "ok" | "error", durationMs: number) => void;
  statusFromResponse?: (response: Res) => "ok" | "error";
}): UnaryInterceptor<Req, Res, Call> {
  return async (context, next) => {
    const startedAt = Date.now();
    try {
      const response = await next(context);
      const status = options.statusFromResponse?.(response) ?? "ok";
      options.record(options.method, status, Date.now() - startedAt);
      return response;
    } catch (error: unknown) {
      options.record(options.method, "error", Date.now() - startedAt);
      throw error;
    }
  };
}

export function withUnaryErrorHandling<Req, Res, Call extends UnaryCall<Req>>(options: {
  method: string;
  logger?: { error: (obj: unknown, msg?: string) => void };
  toServiceError: (error: unknown) => Error;
  shouldLog?: (error: unknown) => boolean;
  message?: string;
}): UnaryInterceptor<Req, Res, Call> {
  return async (context, next) => {
    try {
      return await next(context);
    } catch (error: unknown) {
      const shouldLog = options.shouldLog?.(error) ?? true;
      if (shouldLog) {
        options.logger?.error?.({ err: ensureError(error) }, options.message ?? `${options.method} failed`);
      }
      throw options.toServiceError(error);
    }
  };
}

export function withUnaryErrorResponse<Req, Res, Call extends UnaryCall<Req>>(options: {
  onError?: (context: UnaryContext<Req, Res, Call>, error: unknown) => void;
  errorResponse: (context: UnaryContext<Req, Res, Call>, error: unknown) => Res;
}): UnaryInterceptor<Req, Res, Call> {
  return async (context, next) => {
    try {
      return await next(context);
    } catch (error: unknown) {
      options.onError?.(context, error);
      return options.errorResponse(context, error);
    }
  };
}

export function createUnaryHandler<
  Req,
  Res,
  Call extends UnaryCall<Req>,
  CallbackError extends Error = Error,
>(options: {
  handler: (context: UnaryContext<Req, Res, Call>) => Promise<Res> | Res;
  interceptors?: ReadonlyArray<UnaryInterceptor<Req, Res, Call>>;
  toCallbackError?: (error: unknown) => CallbackError;
}): (call: Call, callback: UnaryCallback<Res, CallbackError>) => Promise<void> {
  const baseHandler: RequestHandler<Req, Res, Call> = async (context) => options.handler(context);
  const handleRequest = chainUnaryInterceptors(baseHandler, options.interceptors ?? []);
  const toCallbackError = options.toCallbackError ?? ((error) => ensureError(error) as CallbackError);

  return async (call, callback) => {
    try {
      const response = await handleRequest({ request: call.request, call });
      callback(null, response);
    } catch (error: unknown) {
      callback(toCallbackError(error));
    }
  };
}
