import type * as grpc from '@grpc/grpc-js';

export type GrpcHandler<Req, Res> = (
  call: grpc.ServerUnaryCall<Req, Res>,
  callback: grpc.sendUnaryData<Res>,
) => Promise<void>;

export interface PublishEventRequest {
  type: string;
  tableId: string;
  handId?: string;
  userId?: string;
  seatId?: number;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface PublishEventsRequest {
  events: PublishEventRequest[];
}

export interface QueryEventsRequest {
  tableId?: string;
  handId?: string;
  userId?: string;
  types?: string[];
  startTime?: { seconds: number; nanos: number };
  endTime?: { seconds: number; nanos: number };
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface GetEventRequest {
  eventId: string;
}

export interface GetHandRecordRequest {
  handId: string;
  requesterId?: string;
}

export interface GetHandHistoryRequest {
  tableId: string;
  limit?: number;
  offset?: number;
  requesterId?: string;
}

export interface GetHandsForUserRequest {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface GetHandReplayRequest {
  handId: string;
  requesterId?: string;
}

export interface SubscribeRequest {
  streamId: string;
  startSequence?: number;
}

export interface GetCursorRequest {
  streamId: string;
  subscriberId: string;
}

export interface UpdateCursorRequest {
  streamId: string;
  subscriberId: string;
  position: number;
}
