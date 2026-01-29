import type * as grpc from '@grpc/grpc-js';

export type GrpcHandler<Req, Res> = (
  call: grpc.ServerUnaryCall<Req, Res>,
  callback: grpc.sendUnaryData<Res>,
) => Promise<void>;

export type ProtoTimestamp = { seconds: number; nanos?: number };

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
  startTime?: ProtoTimestamp;
  endTime?: ProtoTimestamp;
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

export type ProtoPublishEventResponse = {
  success: boolean;
  eventId: string;
};

export type ProtoPublishEventsResponse = {
  success: boolean;
  eventIds: string[];
};

export type ProtoGameEvent = {
  eventId: string;
  type: string;
  tableId: string;
  handId?: string;
  userId?: string;
  seatId?: number;
  payload: unknown;
  timestamp: ProtoTimestamp;
  sequence: number;
};

export type ProtoQueryEventsResponse = {
  events: ProtoGameEvent[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
};

export type ProtoGetHandReplayResponse = {
  handId: string;
  events: ProtoGameEvent[];
};

export type ProtoCursor = {
  cursorId: string;
  streamId: string;
  subscriberId: string;
  position: number;
  createdAt: ProtoTimestamp;
  updatedAt: ProtoTimestamp;
};

export type ProtoParticipantAction = {
  street: string;
  action: string;
  amount: number;
  timestamp: ProtoTimestamp;
};

export type ProtoHandParticipant = {
  seatId: number;
  userId: string;
  nickname: string;
  startingStack: number;
  endingStack: number;
  holeCards: string[];
  actions: ProtoParticipantAction[];
  result: string;
};

export type ProtoHandRecord = {
  handId: string;
  tableId: string;
  tableName: string;
  config: { smallBlind: number; bigBlind: number; ante: number };
  participants: ProtoHandParticipant[];
  communityCards: string[];
  pots: Array<{ amount: number; winners: string[] }>;
  winners: Array<{ userId: string; amount: number }>;
  startedAt: ProtoTimestamp;
  completedAt: ProtoTimestamp;
  durationMs: number;
};

export type ProtoGetHandHistoryResponse = {
  hands: ProtoHandRecord[];
  total: number;
};

export type ProtoGetHandsForUserResponse = {
  hands: ProtoHandRecord[];
  total: number;
};
