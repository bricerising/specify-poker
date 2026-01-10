import express from "express";

import { eventStore, HandEvent } from "../../services/eventStore";
import { replayHand } from "../../services/handReplay";

function redactSnapshot(snapshot: Record<string, unknown>) {
  const next = { ...snapshot };
  if ("holeCards" in next) {
    next.holeCards = {};
  }
  if ("deck" in next) {
    next.deck = [];
  }
  return next;
}

function redactEvent(event: HandEvent): HandEvent {
  const payload = event.payload ?? {};
  const snapshot = payload.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    return event;
  }
  return {
    ...event,
    payload: {
      ...payload,
      snapshot: redactSnapshot(snapshot as Record<string, unknown>),
    },
  };
}

export function createAuditRouter() {
  const router = express.Router();

  router.get("/api/audit/:handId", async (req, res) => {
    if (!req.auth) {
      return res.status(401).json({ code: "auth_denied", message: "Missing auth" });
    }
    const events = await eventStore.list(req.params.handId);
    const redactedEvents = events.map(redactEvent);
    const replay = replayHand(redactedEvents);
    res.status(200).json({ handId: req.params.handId, events: redactedEvents, replay });
  });

  return router;
}
