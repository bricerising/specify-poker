import express from "express";

import { pushNotifications } from "../../services/pushNotifications";

export function createPushRouter() {
  const router = express.Router();

  router.post("/api/push/subscribe", (req, res) => {
    if (!req.auth) {
      return res.status(401).json({ code: "auth_denied", message: "Unauthorized" });
    }

    const subscription = req.body;
    if (!subscription?.endpoint) {
      return res.status(400).json({ code: "invalid_subscription", message: "Missing endpoint" });
    }

    pushNotifications.register(req.auth.userId, subscription);
    res.status(204).send();
  });

  router.delete("/api/push/subscribe", (req, res) => {
    if (!req.auth) {
      return res.status(401).json({ code: "auth_denied", message: "Unauthorized" });
    }

    const { endpoint } = req.body ?? {};
    if (!endpoint) {
      return res.status(400).json({ code: "invalid_subscription", message: "Missing endpoint" });
    }

    pushNotifications.unregister(req.auth.userId, endpoint);
    res.status(204).send();
  });

  return router;
}
