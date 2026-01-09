import express from "express";

import { eventStore } from "../../services/eventStore";
import { replayHand } from "../../services/handReplay";

export function createAuditRouter() {
  const router = express.Router();

  router.get("/api/audit/:handId", (req, res) => {
    const events = eventStore.list(req.params.handId);
    const replay = replayHand(events);
    res.status(200).json({ handId: req.params.handId, events, replay });
  });

  return router;
}
