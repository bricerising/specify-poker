import { randomUUID } from "crypto";
import { toStruct } from "@specify-poker/shared";

import { eventClient, EventPublishResponse } from "../../api/grpc/clients";
import logger from "../../observability/logger";
import { unaryCall } from "./grpcUnary";

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
        EventPublishResponse
      >(eventClient.PublishEvent.bind(eventClient), {
        type: params.type,
        table_id: params.tableId,
        hand_id: params.handId,
        user_id: params.userId,
        seat_id: params.seatId,
        payload: toStruct(params.payload),
        idempotency_key: params.idempotencyKey ?? randomUUID(),
      });
      if (!response.success) {
        logger.error(
          { eventType: params.type, tableId: params.tableId, handId: params.handId },
          "Failed to emit game event",
        );
      }
    } catch (err) {
      logger.error(
        { err, eventType: params.type, tableId: params.tableId, handId: params.handId },
        "Failed to emit game event",
      );
    }
  }
}

export const gameEventPublisher = new GameEventPublisher();
