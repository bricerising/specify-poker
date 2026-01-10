import webPush, { type PushSubscription } from "web-push";

import { pushNotifications } from "./pushNotifications";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
const uiBaseUrl = process.env.UI_BASE_URL ?? "http://localhost:3000";

let configured: boolean | null = null;
let warnedMissingConfig = false;

function ensureConfigured() {
  if (configured !== null) {
    return configured;
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    configured = false;
    return false;
  }
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

export async function notifyTurn(userId: string, tableName: string, tableId: string, seatId: number) {
  if (!ensureConfigured()) {
    if (!warnedMissingConfig) {
      console.warn("push.vapid.missing", { message: "VAPID keys are not configured" });
      warnedMissingConfig = true;
    }
    return;
  }

  const subscriptions = await pushNotifications.list(userId);
  if (subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    title: "Your turn at the table",
    body: `${tableName} - Seat ${seatId + 1} is waiting`,
    url: uiBaseUrl,
    tableId,
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(subscription as PushSubscription, payload);
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? (error as { statusCode?: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await pushNotifications.unregister(userId, subscription.endpoint);
        } else {
          console.warn("push.send.failed", {
            userId,
            tableId,
            seatId,
            message: error instanceof Error ? error.message : "unknown_error",
          });
        }
      }
    }),
  );
}
