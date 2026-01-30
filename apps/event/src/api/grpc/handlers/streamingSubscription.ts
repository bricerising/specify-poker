import * as grpc from '@grpc/grpc-js';
import type { AsyncInterceptor } from '@specify-poker/shared/pipeline';
import { chainAsyncInterceptors } from '@specify-poker/shared/pipeline';
import logger from '../../../observability/logger';
import { isRecord } from '../../../errors';
import { safeJsonParseRecord } from '../../../utils/json';
import { sleep, waitForEvent } from '../../../utils/async';
import { mapEventToProto } from './mappers';
import type { StreamResponse } from '../../../storage/streamStore';
import type { ProtoGameEvent, SubscribeRequest } from '../types';

type ParsedStreamEvent = {
  eventId: string;
  type: string;
  tableId: string;
  handId: string | null;
  userId: string | null;
  seatId: number | null;
  payload: Record<string, unknown>;
  timestamp: Date;
  sequence: number | null;
};

type StreamEventDecodeFailure =
  | { reason: 'invalid_json' }
  | { reason: 'invalid_payload' }
  | { reason: 'invalid_timestamp' };

type StreamEventDecodeResult =
  | { ok: true; event: ParsedStreamEvent }
  | { ok: false; error: StreamEventDecodeFailure };

function decodeStreamEvent(raw: string): StreamEventDecodeResult {
  const parsed = safeJsonParseRecord(raw);
  if (!parsed) {
    return { ok: false, error: { reason: 'invalid_json' } };
  }

  const { eventId, type, tableId, handId, userId, seatId, payload, timestamp, sequence } = parsed;
  if (
    typeof eventId !== 'string' ||
    typeof type !== 'string' ||
    typeof tableId !== 'string' ||
    !isRecord(payload) ||
    typeof timestamp !== 'string'
  ) {
    return { ok: false, error: { reason: 'invalid_payload' } };
  }

  const timestampValue = new Date(timestamp);
  if (Number.isNaN(timestampValue.getTime())) {
    return { ok: false, error: { reason: 'invalid_timestamp' } };
  }

  return {
    ok: true,
    event: {
      eventId,
      type,
      tableId,
      handId: typeof handId === 'string' ? handId : null,
      userId: typeof userId === 'string' ? userId : null,
      seatId: typeof seatId === 'number' && Number.isFinite(seatId) ? seatId : null,
      payload,
      timestamp: timestampValue,
      sequence: typeof sequence === 'number' && Number.isFinite(sequence) ? sequence : null,
    },
  };
}

function toStartSequence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

type StreamSubscriptionStrategy = {
  initialLastId: string;
  shouldEmit(event: ParsedStreamEvent): boolean;
};

function createSubscriptionStrategy(startSequence: number | null): StreamSubscriptionStrategy {
  if (startSequence === null) {
    return { initialLastId: '$', shouldEmit: () => true };
  }
  return {
    initialLastId: '0-0',
    shouldEmit: (event) => event.sequence === null || event.sequence > startSequence,
  };
}

function createAbortController(
  call: grpc.ServerWritableStream<SubscribeRequest, ProtoGameEvent>,
): AbortController {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (typeof call.on === 'function') {
    call.on('cancelled', abort);
    call.on('close', abort);
    call.on('error', abort);
  }
  return controller;
}

type StreamMessageEntry = {
  streamName: string;
  messageId: string;
  fields: Record<string, string>;
};

function* iterStreamMessages(streams: StreamResponse[]): Generator<StreamMessageEntry> {
  for (const stream of streams) {
    for (const message of stream.messages) {
      yield { streamName: stream.name, messageId: message.id, fields: message.message };
    }
  }
}

async function writeWithBackpressure(
  call: grpc.ServerWritableStream<SubscribeRequest, ProtoGameEvent>,
  event: ProtoGameEvent,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return;
  }
  const shouldContinue = call.write(event);
  if (shouldContinue) {
    return;
  }
  await waitForEvent(call, 'drain', signal);
}

type MessageContextEntry = {
  stage: 'entry';
  streamId: string;
  entry: StreamMessageEntry;
  strategy: StreamSubscriptionStrategy;
  call: grpc.ServerWritableStream<SubscribeRequest, ProtoGameEvent>;
  signal: AbortSignal;
};

type MessageContextData = {
  stage: 'data';
  streamId: string;
  entry: StreamMessageEntry;
  rawData: string;
  strategy: StreamSubscriptionStrategy;
  call: grpc.ServerWritableStream<SubscribeRequest, ProtoGameEvent>;
  signal: AbortSignal;
};

type MessageContextDecoded = {
  stage: 'decoded';
  streamId: string;
  entry: StreamMessageEntry;
  event: ParsedStreamEvent;
  strategy: StreamSubscriptionStrategy;
  call: grpc.ServerWritableStream<SubscribeRequest, ProtoGameEvent>;
  signal: AbortSignal;
};

type StreamMessageContext = MessageContextEntry | MessageContextData | MessageContextDecoded;

const extractStreamData: AsyncInterceptor<StreamMessageContext, void> = async (ctx, next) => {
  if (ctx.stage !== 'entry') {
    return next(ctx);
  }

  const rawData = ctx.entry.fields.data;
  if (typeof rawData !== 'string') {
    logger.error(
      { streamId: ctx.streamId, messageId: ctx.entry.messageId, stream: ctx.entry.streamName },
      'Invalid Redis stream message (missing data)',
    );
    return;
  }

  const nextCtx: MessageContextData = {
    stage: 'data',
    streamId: ctx.streamId,
    entry: ctx.entry,
    rawData,
    strategy: ctx.strategy,
    call: ctx.call,
    signal: ctx.signal,
  };
  return next(nextCtx);
};

const decodeEvent: AsyncInterceptor<StreamMessageContext, void> = async (ctx, next) => {
  if (ctx.stage !== 'data') {
    return next(ctx);
  }

  const decoded = decodeStreamEvent(ctx.rawData);
  if (!decoded.ok) {
    const message =
      decoded.error.reason === 'invalid_json'
        ? 'Invalid JSON in Redis stream message'
        : 'Invalid Redis stream message payload';
    logger.error(
      {
        streamId: ctx.streamId,
        messageId: ctx.entry.messageId,
        stream: ctx.entry.streamName,
        reason: decoded.error.reason,
      },
      message,
    );
    return;
  }

  const nextCtx: MessageContextDecoded = {
    stage: 'decoded',
    streamId: ctx.streamId,
    entry: ctx.entry,
    event: decoded.event,
    strategy: ctx.strategy,
    call: ctx.call,
    signal: ctx.signal,
  };
  return next(nextCtx);
};

const applySubscriptionFilter: AsyncInterceptor<StreamMessageContext, void> = async (ctx, next) => {
  if (ctx.stage !== 'decoded') {
    return next(ctx);
  }

  if (!ctx.strategy.shouldEmit(ctx.event)) {
    return;
  }

  return next(ctx);
};

const writeDecodedEvent: AsyncInterceptor<StreamMessageContext, void> = async (ctx, _next) => {
  if (ctx.stage !== 'decoded') {
    return _next(ctx);
  }

  await writeWithBackpressure(ctx.call, mapEventToProto(ctx.event), ctx.signal);
};

const processStreamMessage = chainAsyncInterceptors<StreamMessageContext, void>(
  async () => undefined,
  [extractStreamData, decodeEvent, applySubscriptionFilter, writeDecodedEvent],
);

export type SubscribeToStreamDependencies = {
  streamService: {
    readStream(streamId: string, lastId: string): Promise<StreamResponse[] | null>;
  };
};

export function createSubscribeToStreamHandler(deps: SubscribeToStreamDependencies) {
  return async function subscribeToStream(
    call: grpc.ServerWritableStream<SubscribeRequest, ProtoGameEvent>,
  ): Promise<void> {
    const streamId = typeof call.request.streamId === 'string' ? call.request.streamId.trim() : '';
    if (!streamId) {
      call.emit('error', { code: grpc.status.INVALID_ARGUMENT, message: 'streamId is required' });
      return;
    }

    const controller = createAbortController(call);
    const { signal } = controller;

    const startSequence = toStartSequence(call.request.startSequence);
    const strategy = createSubscriptionStrategy(startSequence);
    let lastId = strategy.initialLastId;

    logger.info({ streamId, startSequence }, 'Subscription started');

    const isCancelled = () => signal.aborted || call.cancelled;

    while (!isCancelled()) {
      try {
        const streams = await deps.streamService.readStream(streamId, lastId);
        if (!streams) {
          continue;
        }

        for (const entry of iterStreamMessages(streams)) {
          lastId = entry.messageId;
          if (isCancelled()) {
            break;
          }

          await processStreamMessage({
            stage: 'entry',
            streamId,
            entry,
            strategy,
            call,
            signal,
          });
        }
      } catch (error: unknown) {
        logger.error({ err: error, streamId }, 'Error reading from Redis stream');
        await sleep(1000, signal);
      }
    }

    logger.info({ streamId }, 'Subscription ended');
  };
}
