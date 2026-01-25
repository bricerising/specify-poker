import { v4 as uuidv4 } from "uuid";
import { toStruct } from "@specify-poker/shared";

import { eventClient } from "../../api/grpc/clients";
import { unaryCall } from "./grpcUnary";

type EventPublish = { success: boolean };

export class GameEventPublisher {
  async publish(params: {
    type: string;
    tableId: string;
    handId?: string;
    userId?: string;
    seatId?: number;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    try {
      const response = await unaryCall<
        {
          type: string;
          table_id: string;
          hand_id?: string;
          user_id?: string;
          seat_id?: number;
          payload: unknown;
          idempotency_key: string;
        },
        EventPublish
      >(eventClient.PublishEvent.bind(eventClient), {
        type: params.type,
        table_id: params.tableId,
        hand_id: params.handId,
        user_id: params.userId,
        seat_id: params.seatId,
        payload: toStruct(params.payload),
        idempotency_key: params.idempotencyKey ?? uuidv4(),
      });
      if (!response.success) {
        console.error("Failed to emit game event");
      }
    } catch (err) {
      console.error("Failed to emit game event:", err);
    }
  }
}

export const gameEventPublisher = new GameEventPublisher();

