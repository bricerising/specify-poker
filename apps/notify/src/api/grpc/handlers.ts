import { SubscriptionService } from "../../services/subscriptionService";
import { PushSenderService } from "../../services/pushSenderService";
import { NotificationPayload, NotificationType, PushSubscription } from "../../domain/types";
import logger from "../../observability/logger";
import { recordGrpcRequest, recordNotificationRequested } from "../../observability/metrics";
import { createUnaryHandler, withUnaryErrorHandling, withUnaryErrorResponse, withUnaryTiming } from "@specify-poker/shared";
import { getErrorMessage, toError } from "../../shared/errors";

type UnaryCall<Req> = { request: Req };
type UnaryCallback<Res> = (error: Error | null, response?: Res) => void;

function createNotifyUnaryHandler<Req, Res>(params: {
  method: string;
  handler: (request: Req) => Promise<Res> | Res;
  statusFromResponse?: (response: Res) => "ok" | "error";
  errorResponse?: (error: unknown) => Res;
  errorLogMessage?: string;
}): (call: UnaryCall<Req>, callback: UnaryCallback<Res>) => Promise<void> {
  const timing = withUnaryTiming<Req, Res, UnaryCall<Req>>({
    method: params.method,
    record: recordGrpcRequest,
    statusFromResponse: params.statusFromResponse,
  });

  if (params.errorResponse) {
    return createUnaryHandler<Req, Res, UnaryCall<Req>>({
      handler: ({ request }) => params.handler(request),
      interceptors: [
        timing,
        withUnaryErrorResponse({
          onError: (_context, error) => {
            logger.error({ err: error }, params.errorLogMessage ?? `${params.method} failed`);
          },
          errorResponse: (_context, error) => params.errorResponse!(error),
        }),
      ],
    });
  }

  return createUnaryHandler<Req, Res, UnaryCall<Req>>({
    handler: ({ request }) => params.handler(request),
    interceptors: [
      timing,
      withUnaryErrorHandling({
        method: params.method,
        logger,
        message: params.errorLogMessage ?? `${params.method} failed`,
        toServiceError: toError,
      }),
    ],
  });
}

function isNotificationType(value: string): value is NotificationType {
  return value === "turn_alert" || value === "game_invite" || value === "system";
}

function resolveNotificationData(
  data: Record<string, string> | undefined
): NotificationPayload["data"] | undefined {
  if (!data || Object.keys(data).length === 0) {
    return undefined;
  }

  const rawType = data.type;
  const type = rawType && isNotificationType(rawType) ? rawType : "system";
  return {
    ...data,
    type,
  };
}

export function createHandlers(subscriptionService: SubscriptionService, pushService: PushSenderService) {
  return {
    registerSubscription: createNotifyUnaryHandler({
      method: "RegisterSubscription",
      statusFromResponse: (response: { ok: boolean }) => (response.ok ? "ok" : "error"),
      errorResponse: (error: unknown) => ({ ok: false, error: getErrorMessage(error) }),
      errorLogMessage: "Failed to register subscription",
      handler: async (request: {
        userId?: string;
        subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      }) => {
        const userId = request.userId;
        const endpoint = request.subscription?.endpoint;
        const p256dh = request.subscription?.keys?.p256dh;
        const auth = request.subscription?.keys?.auth;

        if (!userId || !endpoint || !p256dh || !auth) {
          return { ok: false, error: "MISSING_FIELDS" };
        }

        const sub: PushSubscription = {
          endpoint,
          keys: {
            p256dh,
            auth,
          },
        };

        await subscriptionService.register(userId, sub);
        return { ok: true };
      },
    }),

    unregisterSubscription: createNotifyUnaryHandler({
      method: "UnregisterSubscription",
      statusFromResponse: (response: { ok: boolean }) => (response.ok ? "ok" : "error"),
      errorResponse: (error: unknown) => ({ ok: false, error: getErrorMessage(error) }),
      errorLogMessage: "Failed to unregister subscription",
      handler: async (request: { userId?: string; endpoint?: string }) => {
        const userId = request.userId;
        const endpoint = request.endpoint;
        if (!userId || !endpoint) {
          return { ok: false, error: "MISSING_FIELDS" };
        }

        await subscriptionService.unregister(userId, endpoint);
        return { ok: true };
      },
    }),

    listSubscriptions: createNotifyUnaryHandler({
      method: "ListSubscriptions",
      statusFromResponse: () => "ok",
      errorLogMessage: "Failed to list subscriptions",
      handler: async (request: { userId?: string }) => {
        const userId = request.userId;
        if (!userId) {
          return { subscriptions: [] };
        }

        const subscriptions = await subscriptionService.getSubscriptions(userId);
        return {
          subscriptions: subscriptions.map((s) => ({
            endpoint: s.endpoint,
            keys: {
              p256dh: s.keys.p256dh,
              auth: s.keys.auth,
            },
          })),
        };
      },
    }),

    sendNotification: createNotifyUnaryHandler({
      method: "SendNotification",
      statusFromResponse: (response: { ok: boolean }) => (response.ok ? "ok" : "error"),
      errorResponse: (error: unknown) => ({ ok: false, error: getErrorMessage(error) }),
      errorLogMessage: "Failed to send notification",
      handler: async (request: {
        userId?: string;
        title?: string;
        body?: string;
        url?: string;
        icon?: string;
        tag?: string;
        data?: Record<string, string>;
      }) => {
        const { userId, title, body, url, icon, tag, data } = request;
        if (!userId || !title || !body) {
          return { ok: false, error: "MISSING_FIELDS" };
        }

        const payload: NotificationPayload = {
          title,
          body,
          url: url || undefined,
          icon: icon || undefined,
          tag: tag || undefined,
          data: resolveNotificationData(data),
        };

        recordNotificationRequested(payload.data?.type ?? "system");
        const result = await pushService.sendToUser(userId, payload);
        return {
          ok: true,
          successCount: result.success,
          failureCount: result.failure,
        };
      },
    }),
  };
}
