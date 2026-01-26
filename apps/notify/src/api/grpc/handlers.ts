import { SubscriptionService } from "../../services/subscriptionService";
import { PushSenderService } from "../../services/pushSenderService";
import { NotificationPayload, NotificationType, PushSubscription } from "../../domain/types";
import logger from "../../observability/logger";
import { recordGrpcRequest, recordNotificationRequested } from "../../observability/metrics";

type UnaryCall<Req> = { request: Req };
type UnaryCallback<Res> = (error: Error | null, response?: Res) => void;

function createUnaryHandler<Req, Res>(
  params: {
    method: string;
    handler: (request: Req) => Promise<Res> | Res;
    statusFromResponse?: (response: Res) => "ok" | "error";
    errorResponse?: (error: unknown) => Res;
    errorLogMessage?: string;
  }
) {
  return async (call: UnaryCall<Req>, callback: UnaryCallback<Res>) => {
    const startedAt = Date.now();
    try {
      const response = await params.handler(call.request);
      const status = params.statusFromResponse?.(response) ?? "ok";
      recordGrpcRequest(params.method, status, Date.now() - startedAt);
      callback(null, response);
    } catch (error: unknown) {
      logger.error({ err: error }, params.errorLogMessage ?? `${params.method} failed`);
      recordGrpcRequest(params.method, "error", Date.now() - startedAt);
      if (params.errorResponse) {
        callback(null, params.errorResponse(error));
        return;
      }
      callback(error as Error);
    }
  };
}

function resolveNotificationData(
  data: Record<string, string> | undefined
): NotificationPayload["data"] | undefined {
  if (!data || Object.keys(data).length === 0) {
    return undefined;
  }
  const candidate = data.type as NotificationType | undefined;
  const type = candidate && ["turn_alert", "game_invite", "system"].includes(candidate)
    ? candidate
    : "system";
  return {
    ...data,
    type,
  };
}

export function createHandlers(subscriptionService: SubscriptionService, pushService: PushSenderService) {
  return {
    registerSubscription: createUnaryHandler({
      method: "RegisterSubscription",
      statusFromResponse: (response: { ok: boolean }) => (response.ok ? "ok" : "error"),
      errorResponse: (error: unknown) => ({ ok: false, error: (error as Error).message }),
      errorLogMessage: "Failed to register subscription",
      handler: async (request: {
        userId?: string;
        subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      }) => {
        const userId = request.userId;
        const subscription = request.subscription;
        if (!userId || !subscription || !subscription.endpoint || !subscription.keys) {
          return { ok: false, error: "MISSING_FIELDS" };
        }

        const sub: PushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh!,
            auth: subscription.keys.auth!,
          },
        };

        await subscriptionService.register(userId, sub);
        return { ok: true };
      },
    }),

    unregisterSubscription: createUnaryHandler({
      method: "UnregisterSubscription",
      statusFromResponse: (response: { ok: boolean }) => (response.ok ? "ok" : "error"),
      errorResponse: (error: unknown) => ({ ok: false, error: (error as Error).message }),
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

    listSubscriptions: createUnaryHandler({
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

    sendNotification: createUnaryHandler({
      method: "SendNotification",
      statusFromResponse: (response: { ok: boolean }) => (response.ok ? "ok" : "error"),
      errorResponse: (error: unknown) => ({ ok: false, error: (error as Error).message }),
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
          title: title as string,
          body: body as string,
          url: url as string | undefined,
          icon: icon as string | undefined,
          tag: tag as string | undefined,
          data: resolveNotificationData(data as Record<string, string> | undefined),
        };

        recordNotificationRequested(payload.data?.type ?? "system");
        const result = await pushService.sendToUser(userId as string, payload);
        return {
          ok: true,
          successCount: result.success,
          failureCount: result.failure,
        };
      },
    }),
  };
}
