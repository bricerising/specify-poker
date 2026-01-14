import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { config } from "../config";
import logger from "../observability/logger";

const PROTO_PATH = path.resolve(__dirname, "../../proto/event.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

type StructValue =
  | { nullValue: 0 }
  | { boolValue: boolean }
  | { numberValue: number }
  | { stringValue: string }
  | { listValue: { values: StructValue[] } }
  | { structValue: { fields: StructFields } };

type StructFields = Record<string, StructValue>;

interface PublishEventResponse {
  success: boolean;
  event_id?: string;
}

interface PublishEventsResponse {
  success: boolean;
  event_ids?: string[];
}

interface EventServiceClient {
  PublishEvent(
    request: {
      type: string;
      table_id: string;
      hand_id?: string;
      user_id?: string;
      seat_id?: number;
      payload: { fields: StructFields };
      idempotency_key: string;
    },
    callback: (err: grpc.ServiceError | null, response: PublishEventResponse) => void
  ): void;
  PublishEvents(
    request: {
      events: Array<{
        type: string;
        table_id: string;
        hand_id?: string;
        user_id?: string;
        seat_id?: number;
        payload: { fields: StructFields };
        idempotency_key: string;
      }>;
    },
    callback: (err: grpc.ServiceError | null, response: PublishEventsResponse) => void
  ): void;
}

type EventProto = {
  event: {
    EventService: new (addr: string, creds: grpc.ChannelCredentials) => EventServiceClient;
  };
};

const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as EventProto;

const client = new proto.event.EventService(
  config.eventServiceAddr,
  grpc.credentials.createInsecure()
);

export interface GameEvent {
  type: string;
  tableId: string;
  handId?: string;
  userId?: string;
  seatId?: number;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

export interface PublishResult {
  success: boolean;
  eventId?: string;
}

export async function publishEvent(event: GameEvent): Promise<PublishResult> {
  return new Promise((resolve) => {
    client.PublishEvent(
      {
        type: event.type,
        table_id: event.tableId,
        hand_id: event.handId,
        user_id: event.userId,
        seat_id: event.seatId,
        payload: { fields: objectToStructFields(event.payload) },
        idempotency_key: event.idempotencyKey,
      },
      (err: grpc.ServiceError | null, response: PublishEventResponse) => {
        if (err) {
          logger.error({ err, event }, "Event publish failed");
          resolve({ success: false });
          return;
        }
        resolve({ success: response.success, eventId: response.event_id });
      }
    );
  });
}

export async function publishEvents(events: GameEvent[]): Promise<{ success: boolean; eventIds?: string[] }> {
  return new Promise((resolve) => {
    client.PublishEvents(
      {
        events: events.map((e) => ({
          type: e.type,
          table_id: e.tableId,
          hand_id: e.handId,
          user_id: e.userId,
          seat_id: e.seatId,
          payload: { fields: objectToStructFields(e.payload) },
          idempotency_key: e.idempotencyKey,
        })),
      },
      (err: grpc.ServiceError | null, response: PublishEventsResponse) => {
        if (err) {
          logger.error({ err }, "Batch event publish failed");
          resolve({ success: false });
          return;
        }
        resolve({ success: response.success, eventIds: response.event_ids });
      }
    );
  });
}

// Helper function to convert a plain object to protobuf Struct fields
function objectToStructFields(obj: Record<string, unknown>): StructFields {
  const fields: StructFields = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = valueToStructValue(value);
  }
  return fields;
}

function valueToStructValue(value: unknown): StructValue {
  if (value === null || value === undefined) {
    return { nullValue: 0 };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  if (typeof value === "number") {
    return { numberValue: value };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (Array.isArray(value)) {
    return { listValue: { values: value.map(valueToStructValue) } };
  }
  if (typeof value === "object") {
    return { structValue: { fields: objectToStructFields(value as Record<string, unknown>) } };
  }
  return { stringValue: String(value) };
}

// Event type constants
export const EventTypes = {
  // Table lifecycle
  TABLE_CREATED: "TABLE_CREATED",
  TABLE_DELETED: "TABLE_DELETED",

  // Seat events
  PLAYER_JOINED: "PLAYER_JOINED",
  PLAYER_LEFT: "PLAYER_LEFT",
  SPECTATOR_JOINED: "SPECTATOR_JOINED",
  SPECTATOR_LEFT: "SPECTATOR_LEFT",

  // Hand lifecycle
  HAND_STARTED: "HAND_STARTED",
  HAND_COMPLETED: "HAND_COMPLETED",

  // Street events
  PREFLOP_DEALT: "PREFLOP_DEALT",
  FLOP_DEALT: "FLOP_DEALT",
  TURN_DEALT: "TURN_DEALT",
  RIVER_DEALT: "RIVER_DEALT",

  // Action events
  ACTION_TAKEN: "ACTION_TAKEN",
  TURN_STARTED: "TURN_STARTED",
  TURN_TIMEOUT: "TURN_TIMEOUT",

  // Showdown events
  CARDS_SHOWN: "CARDS_SHOWN",
  POT_AWARDED: "POT_AWARDED",

  // Moderation events
  PLAYER_KICKED: "PLAYER_KICKED",
  PLAYER_MUTED: "PLAYER_MUTED",
  PLAYER_UNMUTED: "PLAYER_UNMUTED",
} as const;

// Convenience functions for common events
export async function emitTableCreated(
  tableId: string,
  ownerId: string,
  tableName: string,
  config: Record<string, unknown>
) {
  return publishEvent({
    type: EventTypes.TABLE_CREATED,
    tableId,
    userId: ownerId,
    payload: { tableName, config },
    idempotencyKey: `table-created-${tableId}`,
  });
}

export async function emitPlayerJoined(tableId: string, userId: string, seatId: number, buyInAmount: number) {
  return publishEvent({
    type: EventTypes.PLAYER_JOINED,
    tableId,
    userId,
    seatId,
    payload: { buyInAmount },
    idempotencyKey: `player-joined-${tableId}-${userId}-${Date.now()}`,
  });
}

export async function emitPlayerLeft(tableId: string, userId: string, seatId: number, finalStack: number) {
  return publishEvent({
    type: EventTypes.PLAYER_LEFT,
    tableId,
    userId,
    seatId,
    payload: { finalStack },
    idempotencyKey: `player-left-${tableId}-${userId}-${Date.now()}`,
  });
}

export async function emitHandStarted(
  tableId: string,
  handId: string,
  participants: Array<Record<string, unknown>>,
  button: number
) {
  return publishEvent({
    type: EventTypes.HAND_STARTED,
    tableId,
    handId,
    payload: { participants, button },
    idempotencyKey: `hand-started-${handId}`,
  });
}

export async function emitActionTaken(
  tableId: string,
  handId: string,
  userId: string,
  seatId: number,
  action: string,
  amount: number,
  street: string
) {
  return publishEvent({
    type: EventTypes.ACTION_TAKEN,
    tableId,
    handId,
    userId,
    seatId,
    payload: { action, amount, street },
    idempotencyKey: `action-${handId}-${seatId}-${Date.now()}`,
  });
}

export async function emitHandCompleted(
  tableId: string,
  handId: string,
  winners: Array<Record<string, unknown>>,
  communityCards: string[],
  rake: number
) {
  return publishEvent({
    type: EventTypes.HAND_COMPLETED,
    tableId,
    handId,
    payload: { winners, communityCards, rake },
    idempotencyKey: `hand-completed-${handId}`,
  });
}
