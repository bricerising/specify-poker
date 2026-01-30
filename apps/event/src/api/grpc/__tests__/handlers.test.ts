import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHandlers } from '../handlers';
import type { EventServiceFacade } from '../../../services/facade';
import type { Cursor, GameEvent, HandRecord } from '../../../domain/types';
import type * as grpc from '@grpc/grpc-js';
import type { ProtoGameEvent, SubscribeRequest } from '../types';

describe('gRPC Handlers', () => {
  let handlers: ReturnType<typeof createHandlers>;
  let services: EventServiceFacade;

  beforeEach(() => {
    vi.clearAllMocks();

    services = {
      eventIngestion: {
        ingestEvent: vi.fn(),
        ingestEvents: vi.fn(),
      },
      eventQuery: {
        queryEvents: vi.fn(),
        getEvent: vi.fn(),
      },
      handRecords: {
        getHandRecord: vi.fn(),
        getHandHistory: vi.fn(),
        getHandsForUser: vi.fn(),
      },
      replay: {
        getHandEvents: vi.fn(),
      },
      stream: {
        getCursor: vi.fn(),
        updateCursor: vi.fn(),
        readStream: vi.fn(),
      },
    } as unknown as EventServiceFacade;

    handlers = createHandlers({ services });
  });

  it('should handle publishEvent', async () => {
    const call = {
      request: {
        type: 'PLAYER_JOINED',
        tableId: 't1',
        payload: { foo: 'bar' },
      },
    } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    const persistedEvent: GameEvent = {
      eventId: 'e1',
      type: 'PLAYER_JOINED',
      tableId: 't1',
      handId: null,
      userId: null,
      seatId: null,
      payload: { foo: 'bar' },
      timestamp: new Date(),
      sequence: null,
    };
    vi.mocked(services.eventIngestion.ingestEvent).mockResolvedValue(persistedEvent);

    await handlers.publishEvent(call as unknown as Record<string, unknown>, callback);

    expect(services.eventIngestion.ingestEvent).toHaveBeenCalledWith({
      type: 'PLAYER_JOINED',
      tableId: 't1',
      payload: { foo: 'bar' },
      handId: undefined,
      userId: undefined,
      seatId: undefined,
      idempotencyKey: undefined,
    });
    expect(callback).toHaveBeenCalledWith(null, { success: true, eventId: 'e1' });
  });

  it('should handle getEvent', async () => {
    const call = { request: { eventId: 'e1' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    const mockEvent: GameEvent = {
      eventId: 'e1',
      type: 'PLAYER_JOINED',
      tableId: 't1',
      handId: null,
      userId: null,
      seatId: null,
      payload: {},
      timestamp: new Date(),
      sequence: 1,
    };
    vi.mocked(services.eventQuery.getEvent).mockResolvedValue(mockEvent);

    await handlers.getEvent(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        eventId: 'e1',
        type: 'PLAYER_JOINED',
      }),
    );
  });

  it('should return NOT_FOUND if event does not exist', async () => {
    const call = { request: { eventId: 'nonexistent' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(services.eventQuery.getEvent).mockResolvedValue(null);

    await handlers.getEvent(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 5, // NOT_FOUND
      }),
    );
  });

  it('should handle publishEvents (plural)', async () => {
    const call = {
      request: {
        events: [
          { type: 'PLAYER_JOINED', tableId: 't1', payload: {} },
          { type: 'PLAYER_LEFT', tableId: 't1', payload: {} },
        ],
      },
    } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    const now = new Date();
    vi.mocked(services.eventIngestion.ingestEvents).mockResolvedValue([
      {
        eventId: 'e1',
        type: 'PLAYER_JOINED',
        tableId: 't1',
        handId: null,
        userId: null,
        seatId: null,
        payload: {},
        timestamp: now,
        sequence: null,
      },
      {
        eventId: 'e2',
        type: 'PLAYER_LEFT',
        tableId: 't1',
        handId: null,
        userId: null,
        seatId: null,
        payload: {},
        timestamp: now,
        sequence: null,
      },
    ]);

    await handlers.publishEvents(call as unknown as Record<string, unknown>, callback);

    expect(services.eventIngestion.ingestEvents).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null, { success: true, eventIds: ['e1', 'e2'] });
  });

  it('should handle queryEvents', async () => {
    const call = {
      request: {
        tableId: 't1',
        limit: 10,
        offset: 0,
      },
    } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    const now = new Date();
    vi.mocked(services.eventQuery.queryEvents).mockResolvedValue({
      events: [
        {
          eventId: 'e1',
          type: 'PLAYER_JOINED',
          tableId: 't1',
          handId: null,
          userId: null,
          seatId: null,
          payload: {},
          timestamp: now,
          sequence: 1,
        },
      ],
      total: 1,
      hasMore: false,
    });

    await handlers.queryEvents(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        total: 1,
        hasMore: false,
      }),
    );
  });

  it('should handle getHandRecord', async () => {
    const call = { request: { handId: 'h1' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    const mockRecord: HandRecord = {
      handId: 'h1',
      tableId: 't1',
      tableName: 'Table',
      config: { smallBlind: 10, bigBlind: 20, ante: 0 },
      participants: [],
      communityCards: [],
      pots: [],
      winners: [],
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 1000,
    };
    vi.mocked(services.handRecords.getHandRecord).mockResolvedValue(mockRecord);

    await handlers.getHandRecord(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        handId: 'h1',
      }),
    );
  });

  it('should handle getHandHistory', async () => {
    const call = { request: { tableId: 't1', limit: 10, offset: 0 } } as unknown as Record<
      string,
      unknown
    >;
    const callback = vi.fn();
    const now = new Date();
    vi.mocked(services.handRecords.getHandHistory).mockResolvedValue({
      hands: [
        {
          handId: 'h1',
          tableId: 't1',
          tableName: 'Table',
          config: { smallBlind: 10, bigBlind: 20, ante: 0 },
          participants: [],
          communityCards: [],
          pots: [],
          winners: [],
          startedAt: now,
          completedAt: now,
          duration: 1000,
        },
      ],
      total: 1,
    });

    await handlers.getHandHistory(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        total: 1,
      }),
    );
  });

  it('should handle getHandsForUser', async () => {
    const call = { request: { userId: 'u1', limit: 10, offset: 0 } } as unknown as Record<
      string,
      unknown
    >;
    const callback = vi.fn();
    const now = new Date();
    vi.mocked(services.handRecords.getHandsForUser).mockResolvedValue({
      hands: [
        {
          handId: 'h1',
          tableId: 't1',
          tableName: 'Table',
          config: { smallBlind: 10, bigBlind: 20, ante: 0 },
          participants: [],
          communityCards: [],
          pots: [],
          winners: [],
          startedAt: now,
          completedAt: now,
          duration: 1000,
        },
      ],
      total: 1,
    });

    await handlers.getHandsForUser(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        total: 1,
      }),
    );
  });

  it('should handle getHandReplay', async () => {
    const call = { request: { handId: 'h1' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(services.replay.getHandEvents).mockResolvedValue([
      {
        eventId: 'e1',
        type: 'PLAYER_JOINED',
        tableId: 't1',
        handId: 'h1',
        userId: null,
        seatId: null,
        payload: {},
        timestamp: new Date(),
        sequence: 1,
      },
    ]);

    await handlers.getHandReplay(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        handId: 'h1',
        events: expect.any(Array),
      }),
    );
  });

  it('should handle updateCursor', async () => {
    const call = {
      request: { streamId: 's1', subscriberId: 'sub1', position: 123 },
    } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    const cursor: Cursor = {
      cursorId: 's1:sub1',
      streamId: 's1',
      subscriberId: 'sub1',
      position: 123,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(services.stream.updateCursor).mockResolvedValue(cursor);

    await handlers.updateCursor(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        position: 123,
      }),
    );
  });

  it('should handle getCursor', async () => {
    const call = { request: { streamId: 's1', subscriberId: 'sub1' } } as unknown as Record<
      string,
      unknown
    >;
    const callback = vi.fn();
    const cursor: Cursor = {
      cursorId: 's1:sub1',
      streamId: 's1',
      subscriberId: 'sub1',
      position: 123,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(services.stream.getCursor).mockResolvedValue(cursor);

    await handlers.getCursor(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        position: 123,
      }),
    );
  });

  it('should handle publishEvent error', async () => {
    const call = {
      request: { type: 'PLAYER_JOINED', tableId: 't1', payload: {} },
    } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(services.eventIngestion.ingestEvent).mockRejectedValue(new Error('Test Error'));

    await handlers.publishEvent(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 13, // INTERNAL
        message: 'Test Error',
      }),
    );
  });

  it('should handle getHandRecord NOT_FOUND', async () => {
    const call = { request: { handId: 'nonexistent' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(services.handRecords.getHandRecord).mockResolvedValue(null);

    await handlers.getHandRecord(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 5, // NOT_FOUND
      }),
    );
  });

  it('streams table events across hands when startSequence is omitted', async () => {
    const now = new Date();
    const writes: unknown[] = [];

    const call = {
      request: { streamId: 'table:t1' },
      cancelled: false,
      write: vi.fn((event: unknown) => {
        writes.push(event);
        if (writes.length === 4) {
          call.cancelled = true;
        }
        return true;
      }),
      emit: vi.fn(),
    } as unknown as Record<string, unknown>;

    vi.mocked(services.stream.readStream)
      .mockResolvedValueOnce([
        {
          name: 'event:streams:table:t1:events',
          messages: [
            {
              id: '1-0',
              message: {
                data: JSON.stringify({
                  eventId: 'e1',
                  type: 'T1',
                  tableId: 't1',
                  handId: 'h1',
                  userId: null,
                  seatId: null,
                  payload: {},
                  timestamp: now.toISOString(),
                  sequence: 10,
                }),
              },
            },
            {
              id: '2-0',
              message: {
                data: JSON.stringify({
                  eventId: 'e2',
                  type: 'T2',
                  tableId: 't1',
                  handId: 'h1',
                  userId: null,
                  seatId: null,
                  payload: {},
                  timestamp: now.toISOString(),
                  sequence: 11,
                }),
              },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          name: 'event:streams:table:t1:events',
          messages: [
            {
              id: '3-0',
              message: {
                data: JSON.stringify({
                  eventId: 'e3',
                  type: 'T3',
                  tableId: 't1',
                  handId: 'h2',
                  userId: null,
                  seatId: null,
                  payload: {},
                  timestamp: now.toISOString(),
                  sequence: 1,
                }),
              },
            },
            {
              id: '4-0',
              message: {
                data: JSON.stringify({
                  eventId: 'e4',
                  type: 'T4',
                  tableId: 't1',
                  handId: 'h2',
                  userId: null,
                  seatId: null,
                  payload: {},
                  timestamp: now.toISOString(),
                  sequence: 2,
                }),
              },
            },
          ],
        },
      ]);

    await handlers.subscribeToStream(
      call as unknown as grpc.ServerWritableStream<SubscribeRequest, ProtoGameEvent>,
    );

    expect(writes).toHaveLength(4);
  });

  it('streams from a startSequence (exclusive)', async () => {
    const now = new Date();
    const writes: unknown[] = [];

    const call = {
      request: { streamId: 'hand:h1', startSequence: 2 },
      cancelled: false,
      write: vi.fn((event: unknown) => {
        writes.push(event);
        call.cancelled = true;
        return true;
      }),
      emit: vi.fn(),
    } as unknown as Record<string, unknown>;

    vi.mocked(services.stream.readStream).mockResolvedValueOnce([
      {
        name: 'event:streams:hand:h1:events',
        messages: [
          {
            id: '1-0',
            message: {
              data: JSON.stringify({
                eventId: 'e1',
                type: 'T1',
                tableId: 't1',
                handId: 'h1',
                userId: null,
                seatId: null,
                payload: {},
                timestamp: now.toISOString(),
                sequence: 1,
              }),
            },
          },
          {
            id: '2-0',
            message: {
              data: JSON.stringify({
                eventId: 'e2',
                type: 'T2',
                tableId: 't1',
                handId: 'h1',
                userId: null,
                seatId: null,
                payload: {},
                timestamp: now.toISOString(),
                sequence: 2,
              }),
            },
          },
          {
            id: '3-0',
            message: {
              data: JSON.stringify({
                eventId: 'e3',
                type: 'T3',
                tableId: 't1',
                handId: 'h1',
                userId: null,
                seatId: null,
                payload: {},
                timestamp: now.toISOString(),
                sequence: 3,
              }),
            },
          },
        ],
      },
    ]);

    await handlers.subscribeToStream(
      call as unknown as grpc.ServerWritableStream<SubscribeRequest, ProtoGameEvent>,
    );

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(expect.objectContaining({ eventId: 'e3', sequence: 3 }));
  });
});
