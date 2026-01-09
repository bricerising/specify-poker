import { apiFetch } from "./apiClient";

export async function registerPushSubscription(subscription: PushSubscriptionJSON) {
  await apiFetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subscription),
  });
}

export async function unregisterPushSubscription(endpoint: string) {
  await apiFetch("/api/push/subscribe", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint }),
  });
}
