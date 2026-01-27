import type { NotificationPayload } from "../domain/types";
import logger from "../observability/logger";

export type GameEvent = {
  type: "TURN_STARTED";
  userId: string;
  tableId?: string;
};

export type PushSender = {
  sendToUser(userId: string, payload: NotificationPayload): Promise<{ success: number; failure: number }>;
};

export type GameEventDecodeResult =
  | { ok: true; event: GameEvent }
  | { ok: false; reason: "InvalidMessage" }
  | { ok: false; reason: "UnknownType"; type: string };

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

export function decodeGameEvent(message: unknown): GameEventDecodeResult {
  if (!isStringRecord(message)) {
    return { ok: false, reason: "InvalidMessage" };
  }

  const type = message.type;
  switch (type) {
    case "TURN_STARTED": {
      const userId = message.userId;
      if (!userId) {
        return { ok: false, reason: "InvalidMessage" };
      }

      const tableId = message.tableId || undefined;
      return { ok: true, event: { type, userId, tableId } };
    }
    default: {
      if (!type) {
        return { ok: false, reason: "InvalidMessage" };
      }

      return { ok: false, reason: "UnknownType", type };
    }
  }
}

export type GameEventHandlers = {
  [Type in GameEvent["type"]]: (event: Extract<GameEvent, { type: Type }>) => Promise<void>;
};

export function createGameEventHandlers(pushSender: PushSender): GameEventHandlers {
  return {
    TURN_STARTED: async ({ userId, tableId }) => {
      logger.info({ userId, tableId }, "Triggering turn alert");
      await pushSender.sendToUser(userId, {
        title: "It's your turn!",
        body: `Action is on you at table ${tableId || "unknown"}.`,
        url: tableId ? `/tables/${tableId}` : "/",
        tag: tableId ? `turn-${tableId}` : undefined,
        data: {
          type: "turn_alert",
          tableId,
        },
      });
    },
  };
}
