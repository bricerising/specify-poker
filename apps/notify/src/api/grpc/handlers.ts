import { SubscriptionService } from "../../services/subscriptionService";
import { PushSenderService } from "../../services/pushSenderService";
import { NotificationPayload, NotificationType, PushSubscription } from "../../domain/types";
import logger from "../../observability/logger";
import { recordGrpcRequest, recordNotificationRequested } from "../../observability/metrics";

function recordDuration(method: string, startedAt: number, status: "ok" | "error") {
  recordGrpcRequest(method, status, Date.now() - startedAt);
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
    registerSubscription: async (call: { request: { userId?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } } }, callback: (error: Error | null, response?: unknown) => void) => {
      const startedAt = Date.now();
      try {
        const userId = call.request.userId;
        const subscription = call.request.subscription;
        if (!userId || !subscription || !subscription.endpoint || !subscription.keys) {
          recordDuration("RegisterSubscription", startedAt, "error");
          return callback(null, { ok: false, error: "MISSING_FIELDS" });
        }

        const sub: PushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh!,
            auth: subscription.keys.auth!,
          },
        };

        await subscriptionService.register(userId, sub);
        recordDuration("RegisterSubscription", startedAt, "ok");
        callback(null, { ok: true });
      } catch (error: unknown) {
        logger.error({ err: error }, "Failed to register subscription");
        recordDuration("RegisterSubscription", startedAt, "error");
        callback(null, { ok: false, error: (error as Error).message });
      }
    },

    unregisterSubscription: async (call: { request: { userId?: string; endpoint?: string } }, callback: (error: Error | null, response?: unknown) => void) => {
      const startedAt = Date.now();
      try {
        const userId = call.request.userId;
        const endpoint = call.request.endpoint;
        if (!userId || !endpoint) {
          recordDuration("UnregisterSubscription", startedAt, "error");
          return callback(null, { ok: false, error: "MISSING_FIELDS" });
        }

        await subscriptionService.unregister(userId, endpoint);
        recordDuration("UnregisterSubscription", startedAt, "ok");
        callback(null, { ok: true });
      } catch (error: unknown) {
        logger.error({ err: error }, "Failed to unregister subscription");
        recordDuration("UnregisterSubscription", startedAt, "error");
        callback(null, { ok: false, error: (error as Error).message });
      }
    },

    listSubscriptions: async (call: { request: { userId?: string } }, callback: (error: Error | null, response?: unknown) => void) => {
      const startedAt = Date.now();
      try {
        const userId = call.request.userId;
        if (!userId) {
          recordDuration("ListSubscriptions", startedAt, "ok");
          return callback(null, { subscriptions: [] });
        }

        const subscriptions = await subscriptionService.getSubscriptions(userId);
        recordDuration("ListSubscriptions", startedAt, "ok");
        callback(null, {
          subscriptions: subscriptions.map((s) => ({
            endpoint: s.endpoint,
            keys: {
              p256dh: s.keys.p256dh,
              auth: s.keys.auth,
            },
          })),
        });
      } catch (error: unknown) {
        logger.error({ err: error }, "Failed to list subscriptions");
        recordDuration("ListSubscriptions", startedAt, "error");
        callback(error as Error);
      }
    },

    sendNotification: async (call: { request: { userId?: string; title?: string; body?: string; url?: string; icon?: string; tag?: string; data?: Record<string, string> } }, callback: (error: Error | null, response?: unknown) => void) => {
      const startedAt = Date.now();
      try {
        const { userId, title, body, url, icon, tag, data } = call.request;
        if (!userId || !title || !body) {
          recordDuration("SendNotification", startedAt, "error");
          return callback(null, { ok: false, error: "MISSING_FIELDS" });
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
        recordDuration("SendNotification", startedAt, "ok");
        callback(null, {
          ok: true,
          successCount: result.success,
          failureCount: result.failure,
        });
      } catch (error: unknown) {
        logger.error({ err: error }, "Failed to send notification");
        recordDuration("SendNotification", startedAt, "error");
        callback(null, { ok: false, error: (error as Error).message });
      }
    },
  };
}
