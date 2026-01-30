import logger from '../../observability/logger';
import { recordGrpcRequest } from '../../observability/metrics';
import {
  createUnaryHandler,
  withUnaryErrorHandling,
  withUnaryErrorResponse,
  withUnaryTiming,
} from '@specify-poker/shared';
import type { UnaryCall, UnaryCallback } from '@specify-poker/shared';
import { getErrorMessage, toError } from '../../shared/errors';
import type { NotifyService } from '../../services/notifyService';
import type { PushSubscription } from '../../domain/types';
import {
  decodeListSubscriptionsRequest,
  decodeRegisterSubscriptionRequest,
  decodeSendNotificationRequest,
  decodeUnregisterSubscriptionRequest,
} from './requestDecoders';

type GrpcOkResponse = { ok: boolean; error?: string };
type GrpcListSubscriptionsResponse = { subscriptions: PushSubscription[] };
type GrpcSendNotificationResponse = {
  ok: boolean;
  successCount: number;
  failureCount: number;
  error?: string;
};

function createNotifyUnaryHandler<Req, Res>(params: {
  method: string;
  handler: (request: Req) => Promise<Res> | Res;
  statusFromResponse?: (response: Res) => 'ok' | 'error';
  errorResponse?: (error: unknown) => Res;
  errorLogMessage?: string;
}): (call: UnaryCall<Req>, callback: UnaryCallback<Res>) => Promise<void> {
  const timing = withUnaryTiming<Req, Res, UnaryCall<Req>>({
    method: params.method,
    record: recordGrpcRequest,
    statusFromResponse: params.statusFromResponse,
  });

  const errorLogMessage = params.errorLogMessage ?? `${params.method} failed`;
  const errorResponse = params.errorResponse;

  const errorInterceptor = errorResponse
    ? withUnaryErrorResponse<Req, Res, UnaryCall<Req>>({
        onError: (_context, error) => {
          logger.error({ err: toError(error) }, errorLogMessage);
        },
        errorResponse: (_context, error) => errorResponse(error),
      })
    : withUnaryErrorHandling<Req, Res, UnaryCall<Req>>({
        method: params.method,
        logger,
        message: errorLogMessage,
        toServiceError: toError,
      });

  return createUnaryHandler<Req, Res, UnaryCall<Req>>({
    handler: ({ request }) => params.handler(request),
    interceptors: [timing, errorInterceptor],
  });
}

export function createHandlers(
  notifyService: NotifyService,
): {
  registerSubscription: (
    call: UnaryCall<unknown>,
    callback: UnaryCallback<GrpcOkResponse>,
  ) => Promise<void>;
  unregisterSubscription: (
    call: UnaryCall<unknown>,
    callback: UnaryCallback<GrpcOkResponse>,
  ) => Promise<void>;
  listSubscriptions: (
    call: UnaryCall<unknown>,
    callback: UnaryCallback<GrpcListSubscriptionsResponse>,
  ) => Promise<void>;
  sendNotification: (
    call: UnaryCall<unknown>,
    callback: UnaryCallback<GrpcSendNotificationResponse>,
  ) => Promise<void>;
} {
  return {
    registerSubscription: createNotifyUnaryHandler<unknown, GrpcOkResponse>({
      method: 'RegisterSubscription',
      statusFromResponse: (response: { ok: boolean }) => (response.ok ? 'ok' : 'error'),
      errorResponse: (error: unknown) => ({ ok: false, error: getErrorMessage(error) }),
      errorLogMessage: 'Failed to register subscription',
      handler: async (request: unknown) => {
        const decoded = decodeRegisterSubscriptionRequest(request);
        if (!decoded.ok) {
          return { ok: false, error: decoded.error };
        }

        await notifyService.registerSubscription(decoded.value.userId, decoded.value.subscription);
        return { ok: true };
      },
    }),

    unregisterSubscription: createNotifyUnaryHandler<unknown, GrpcOkResponse>({
      method: 'UnregisterSubscription',
      statusFromResponse: (response: { ok: boolean }) => (response.ok ? 'ok' : 'error'),
      errorResponse: (error: unknown) => ({ ok: false, error: getErrorMessage(error) }),
      errorLogMessage: 'Failed to unregister subscription',
      handler: async (request: unknown) => {
        const decoded = decodeUnregisterSubscriptionRequest(request);
        if (!decoded.ok) {
          return { ok: false, error: decoded.error };
        }

        await notifyService.unregisterSubscription(decoded.value.userId, decoded.value.endpoint);
        return { ok: true };
      },
    }),

    listSubscriptions: createNotifyUnaryHandler<unknown, GrpcListSubscriptionsResponse>({
      method: 'ListSubscriptions',
      statusFromResponse: () => 'ok',
      errorLogMessage: 'Failed to list subscriptions',
      handler: async (request: unknown) => {
        const { userId } = decodeListSubscriptionsRequest(request);
        if (!userId) {
          return { subscriptions: [] };
        }

        const subscriptions = await notifyService.listSubscriptions(userId);
        return { subscriptions };
      },
    }),

    sendNotification: createNotifyUnaryHandler<unknown, GrpcSendNotificationResponse>({
      method: 'SendNotification',
      statusFromResponse: (response: { ok: boolean }) => (response.ok ? 'ok' : 'error'),
      errorResponse: (error: unknown) => ({
        ok: false,
        error: getErrorMessage(error),
        successCount: 0,
        failureCount: 0,
      }),
      errorLogMessage: 'Failed to send notification',
      handler: async (request: unknown) => {
        const decoded = decodeSendNotificationRequest(request);
        if (!decoded.ok) {
          return { ok: false, error: decoded.error, successCount: 0, failureCount: 0 };
        }

        const result = await notifyService.sendNotification(
          decoded.value.userId,
          decoded.value.payload,
        );
        return {
          ok: true,
          successCount: result.success,
          failureCount: result.failure,
        };
      },
    }),
  };
}
