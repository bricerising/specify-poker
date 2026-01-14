import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHandlers } from "../handlers";
import { eventIngestionService } from "../../../services/eventIngestionService";
import { eventQueryService } from "../../../services/eventQueryService";
import { handRecordService } from "../../../services/handRecordService";
import { replayService } from "../../../services/replayService";
import { streamService } from "../../../services/streamService";

vi.mock("../../../services/eventIngestionService", () => ({
  eventIngestionService: {
    ingestEvent: vi.fn(),
    ingestEvents: vi.fn(),
  },
}));

vi.mock("../../../services/eventQueryService", () => ({
  eventQueryService: {
    queryEvents: vi.fn(),
    getEvent: vi.fn(),
  },
}));

vi.mock("../../../services/handRecordService", () => ({
  handRecordService: {
    getHandRecord: vi.fn(),
    getHandHistory: vi.fn(),
    getHandsForUser: vi.fn(),
  },
}));

vi.mock("../../../services/replayService", () => ({
  replayService: {
    getHandEvents: vi.fn(),
  },
}));

vi.mock("../../../services/streamService", () => ({
  streamService: {
    getCursor: vi.fn(),
    updateCursor: vi.fn(),
    readStream: vi.fn(),
  },
}));

describe('gRPC Handlers', () => {
  let handlers: ReturnType<typeof createHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = createHandlers();
  });

  it('should handle publishEvent', async () => {
    const call = {
      request: {
        type: 'TEST',
        tableId: 't1',
        payload: { foo: 'bar' }
      }
    } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(eventIngestionService.ingestEvent).mockResolvedValue({ eventId: "e1" });

    await handlers.publishEvent(call as unknown as Record<string, unknown>, callback);

    expect(eventIngestionService.ingestEvent).toHaveBeenCalledWith({
      type: "TEST",
      tableId: "t1",
      payload: { foo: "bar" },
      handId: undefined,
      userId: undefined,
      seatId: undefined,
      idempotencyKey: undefined,
    });
    expect(callback).toHaveBeenCalledWith(null, { success: true, eventId: "e1" });
  });

  it('should handle getEvent', async () => {
    const call = { request: { eventId: 'e1' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    const mockEvent = {
      eventId: "e1",
      type: "TEST",
      tableId: "t1",
      payload: {},
      timestamp: new Date(),
      sequence: 1,
    };
    vi.mocked(eventQueryService.getEvent).mockResolvedValue(mockEvent);

    await handlers.getEvent(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      eventId: 'e1',
      type: 'TEST'
    }));
  });

  it('should return NOT_FOUND if event does not exist', async () => {
    const call = { request: { eventId: 'nonexistent' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(eventQueryService.getEvent).mockResolvedValue(null);

    await handlers.getEvent(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      code: 5 // NOT_FOUND
    }));
  });

  it('should handle publishEvents (plural)', async () => {
    const call = {
      request: {
        events: [
          { type: 'T1', tableId: 't1', payload: {} },
          { type: 'T2', tableId: 't1', payload: {} }
        ]
      }
    } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(eventIngestionService.ingestEvents).mockResolvedValue([
      { eventId: "e1" },
      { eventId: "e2" },
    ]);

    await handlers.publishEvents(call as unknown as Record<string, unknown>, callback);

    expect(eventIngestionService.ingestEvents).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null, { success: true, eventIds: ["e1", "e2"] });
  });

  it('should handle queryEvents', async () => {
    const call = {
      request: {
        tableId: 't1',
        limit: 10,
        offset: 0
      }
    } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(eventQueryService.queryEvents).mockResolvedValue({
      events: [
        { eventId: "e1", type: "T1", tableId: "t1", payload: {}, timestamp: new Date(), sequence: 1 },
      ],
      total: 1,
      hasMore: false,
    });

    await handlers.queryEvents(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      total: 1,
      hasMore: false
    }));
  });

  it('should handle getHandRecord', async () => {
    const call = { request: { handId: 'h1' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    const mockRecord = {
      handId: "h1",
      tableId: "t1",
      tableName: "Table",
      config: { smallBlind: 10, bigBlind: 20, ante: 0 },
      participants: [],
      communityCards: [],
      pots: [],
      winners: [],
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 1000,
    };
    vi.mocked(handRecordService.getHandRecord).mockResolvedValue(mockRecord as unknown as Record<string, unknown>);

    await handlers.getHandRecord(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      handId: 'h1'
    }));
  });

  it('should handle getHandHistory', async () => {
    const call = { request: { tableId: 't1', limit: 10, offset: 0 } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(handRecordService.getHandHistory).mockResolvedValue({
      hands: [
        {
          handId: "h1",
          tableId: "t1",
          tableName: "Table",
          config: { smallBlind: 10, bigBlind: 20, ante: 0 },
          participants: [],
          communityCards: [],
          pots: [],
          winners: [],
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 1000,
        },
      ],
      total: 1,
    } as unknown as Record<string, unknown>);

    await handlers.getHandHistory(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      total: 1
    }));
  });

  it('should handle getHandsForUser', async () => {
    const call = { request: { userId: 'u1', limit: 10, offset: 0 } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(handRecordService.getHandsForUser).mockResolvedValue({
      hands: [
        {
          handId: "h1",
          tableId: "t1",
          tableName: "Table",
          config: { smallBlind: 10, bigBlind: 20, ante: 0 },
          participants: [],
          communityCards: [],
          pots: [],
          winners: [],
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 1000,
        },
      ],
      total: 1,
    } as unknown as Record<string, unknown>);

    await handlers.getHandsForUser(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      total: 1
    }));
  });

  it('should handle getHandReplay', async () => {
    const call = { request: { handId: 'h1' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(replayService.getHandEvents).mockResolvedValue([
      { eventId: "e1", type: "T1", tableId: "t1", payload: {}, timestamp: new Date(), sequence: 1 },
    ]);

    await handlers.getHandReplay(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      handId: 'h1',
      events: expect.any(Array)
    }));
  });

  it('should handle updateCursor', async () => {
    const call = { request: { streamId: 's1', subscriberId: 'sub1', position: 123 } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(streamService.updateCursor).mockResolvedValue({
      cursorId: "s1:sub1",
      streamId: "s1",
      subscriberId: "sub1",
      position: 123,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await handlers.updateCursor(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      position: 123
    }));
  });

  it('should handle getCursor', async () => {
    const call = { request: { streamId: 's1', subscriberId: 'sub1' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(streamService.getCursor).mockResolvedValue({
      cursorId: "s1:sub1",
      streamId: "s1",
      subscriberId: "sub1",
      position: 123,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await handlers.getCursor(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      position: 123
    }));
  });

  it('should handle publishEvent error', async () => {
    const call = { request: { type: 'TEST', tableId: 't1' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(eventIngestionService.ingestEvent).mockRejectedValue(new Error("Test Error"));

    await handlers.publishEvent(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      code: 13, // INTERNAL
      message: 'Test Error'
    }));
  });

  it('should handle getHandRecord NOT_FOUND', async () => {
    const call = { request: { handId: 'nonexistent' } } as unknown as Record<string, unknown>;
    const callback = vi.fn();
    vi.mocked(handRecordService.getHandRecord).mockResolvedValue(null);

    await handlers.getHandRecord(call as unknown as Record<string, unknown>, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      code: 5 // NOT_FOUND
    }));
  });
});
