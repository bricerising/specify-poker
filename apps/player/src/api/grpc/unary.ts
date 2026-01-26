import type { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";
import { asError } from "../../domain/errors";

type UnaryCallback<Res> = sendUnaryData<Res>;

export type UnaryHandler<Req, Res> = (
  call: ServerUnaryCall<Req, Res>,
  callback: UnaryCallback<Res>
) => Promise<void>;

export type RequestHandler<Req, Res> = (request: Req) => Promise<Res>;

export type UnaryInterceptor<Req, Res> = (
  request: Req,
  next: RequestHandler<Req, Res>
) => Promise<Res>;

export function chainUnaryInterceptors<Req, Res>(
  handler: RequestHandler<Req, Res>,
  interceptors: ReadonlyArray<UnaryInterceptor<Req, Res>>
): RequestHandler<Req, Res> {
  return interceptors.reduceRight<RequestHandler<Req, Res>>(
    (next, interceptor) => (request) => interceptor(request, next),
    handler
  );
}

export function withUnaryHooks<Req, Res>(hooks?: {
  onSuccess?: (request: Req, response: Res) => void;
  onError?: (request: Req, error: unknown) => void;
}): UnaryInterceptor<Req, Res> {
  return async (request, next) => {
    try {
      const response = await next(request);
      hooks?.onSuccess?.(request, response);
      return response;
    } catch (error: unknown) {
      hooks?.onError?.(request, error);
      throw error;
    }
  };
}

export function withUnaryTiming<Req, Res>(options: {
  method: string;
  recordGrpcRequest: (method: string, status: "ok" | "error", durationMs: number) => void;
}): UnaryInterceptor<Req, Res> {
  return async (request, next) => {
    const startedAt = Date.now();
    try {
      const response = await next(request);
      options.recordGrpcRequest(options.method, "ok", Date.now() - startedAt);
      return response;
    } catch (error: unknown) {
      options.recordGrpcRequest(options.method, "error", Date.now() - startedAt);
      throw error;
    }
  };
}

export function withUnaryErrorHandling<Req, Res>(options: {
  method: string;
  logger: { error: (obj: unknown, msg?: string) => void };
  toServiceError: (error: unknown) => Error;
}): UnaryInterceptor<Req, Res> {
  return async (request, next) => {
    try {
      return await next(request);
    } catch (error: unknown) {
      const original = asError(error);
      const mapped = options.toServiceError(original);
      options.logger.error({ err: original }, `${options.method} failed`);
      throw mapped;
    }
  };
}

export function createUnaryHandler<Req, Res>(options: {
  method: string;
  handler: (request: Req) => Promise<Res> | Res;
  interceptors?: ReadonlyArray<UnaryInterceptor<Req, Res>>;
}): UnaryHandler<Req, Res> {
  const baseHandler: RequestHandler<Req, Res> = async (request) => options.handler(request);
  const handleRequest = chainUnaryInterceptors(baseHandler, options.interceptors ?? []);

  return async (call, callback) => {
    try {
      const response = await handleRequest(call.request);
      callback(null, response);
    } catch (error: unknown) {
      callback(asError(error));
    }
  };
}
