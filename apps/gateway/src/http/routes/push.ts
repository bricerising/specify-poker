import { Request, Response, Router } from "express";
import { grpc } from "../../grpc/unaryClients";
import { requireUserId } from "../utils/requireUserId";
import logger from "../../observability/logger";

const router = Router();

type ParsedSubscription =
  | { ok: true; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } }
  | { ok: false; error: string };

function parseSubscription(body: unknown): ParsedSubscription {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid subscription" };
  }

  const record = body as Record<string, unknown>;
  const endpoint = typeof record.endpoint === "string" ? record.endpoint.trim() : "";
  if (!endpoint) {
    return { ok: false, error: "endpoint is required" };
  }

  const keysValue = record.keys;
  if (!keysValue || typeof keysValue !== "object") {
    return { ok: false, error: "keys are required" };
  }

  const keysRecord = keysValue as Record<string, unknown>;
  const p256dh = typeof keysRecord.p256dh === "string" ? keysRecord.p256dh.trim() : "";
  const auth = typeof keysRecord.auth === "string" ? keysRecord.auth.trim() : "";
  if (!p256dh || !auth) {
    return { ok: false, error: "keys.p256dh and keys.auth are required" };
  }

  return { ok: true, subscription: { endpoint, keys: { p256dh, auth } } };
}

router.get("/vapid", (req: Request, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(503).json({ error: "VAPID public key is not configured" });
  }
  return res.json({ publicKey });
});

router.post("/subscribe", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const parsed = parseSubscription(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const response = await grpc.notify.RegisterSubscription({
      user_id: userId,
      subscription: parsed.subscription,
    });

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to register subscription" });
    }

    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Failed to register push subscription");
    return res.status(500).json({ error: "Failed to register push subscription" });
  }
});

router.delete("/subscribe", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
    if (!endpoint) {
      return res.status(400).json({ error: "endpoint is required" });
    }

    const response = await grpc.notify.UnregisterSubscription({
      user_id: userId,
      endpoint,
    });

    if (!response.ok) {
      return res.status(400).json({ error: response.error || "Failed to unregister subscription" });
    }

    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Failed to unregister push subscription");
    return res.status(500).json({ error: "Failed to unregister push subscription" });
  }
});

export default router;
