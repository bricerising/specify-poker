import express from "express";

import { pushNotifications } from "../../services/pushNotifications";
import { getVapidPublicKey } from "../../services/pushSender";

export function createPushRouter() {
  const router = express.Router();

  router.get("/api/push/vapid", (_req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return res.status(503).json({ code: "vapid_missing", message: "VAPID key not configured" });
    }
    return res.status(200).json({ publicKey });
  });

  router.post("/api/push/subscribe", async (req, res) => {
    if (!req.auth) {
      return res.status(401).json({ code: "auth_denied", message: "Unauthorized" });
    }

    const subscription = req.body;
    if (!subscription?.endpoint) {
      return res.status(400).json({ code: "invalid_subscription", message: "Missing endpoint" });
    }

    await pushNotifications.register(req.auth.userId, subscription);
    res.status(204).send();
  });

  router.delete("/api/push/subscribe", async (req, res) => {
    if (!req.auth) {
      return res.status(401).json({ code: "auth_denied", message: "Unauthorized" });
    }

    const { endpoint } = req.body ?? {};
    if (!endpoint) {
      return res.status(400).json({ code: "invalid_subscription", message: "Missing endpoint" });
    }

    await pushNotifications.unregister(req.auth.userId, endpoint);
    res.status(204).send();
  });

  return router;
}
