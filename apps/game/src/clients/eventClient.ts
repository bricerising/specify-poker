import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { config } from "../config";
import logger from "../observability/logger";
import { StructFields, toStructFields, unaryCallResult } from "@specify-poker/shared";

const PROTO_PATH = path.resolve(__dirname, "../../proto/event.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

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
  const call = await unaryCallResult(client.PublishEvent.bind(client), {
    type: event.type,
    table_id: event.tableId,
    hand_id: event.handId,
    user_id: event.userId,
    seat_id: event.seatId,
    payload: { fields: toStructFields(event.payload) },
    idempotency_key: event.idempotencyKey,
  });

  if (!call.ok) {
    logger.error({ err: call.error, event }, "Event publish failed");
    return { success: false };
  }

  const response = call.value;
  return { success: response.success, eventId: response.event_id };
}

export async function publishEvents(events: GameEvent[]): Promise<{ success: boolean; eventIds?: string[] }> {
  const call = await unaryCallResult(client.PublishEvents.bind(client), {
    events: events.map((e) => ({
      type: e.type,
      table_id: e.tableId,
      hand_id: e.handId,
      user_id: e.userId,
      seat_id: e.seatId,
      payload: { fields: toStructFields(e.payload) },
      idempotency_key: e.idempotencyKey,
    })),
  });

  if (!call.ok) {
    logger.error({ err: call.error }, "Batch event publish failed");
    return { success: false };
  }

  const response = call.value;
  return { success: response.success, eventIds: response.event_ids };
}

// Import and re-export event types from the centralized domain constants
import { GameEventType } from "../domain/events";
export { GameEventType as EventTypes } from "../domain/events";

// Use the imported constant for internal functions
const EventTypes = GameEventType;

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
