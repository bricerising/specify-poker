import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventStore } from "../eventStore";
import pool from "../pgClient";
import redisClient from "../redisClient";

vi.mock('../pgClient', () => ({
  default: {
    connect: vi.fn(),
    query: vi.fn(),
  },
}));

vi.mock('../redisClient', () => ({
  default: {
    xAdd: vi.fn(),
    incr: vi.fn(),
  },
}));

describe('EventStore', () => {
  let eventStore: EventStore;
  let mockClient: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    eventStore = new EventStore();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    (pool.connect as unknown).mockResolvedValue(mockClient);
    (pool.query as unknown).mockImplementation(() => Promise.resolve({ rows: [] }));
  });

  it('should publish an event successfully', async () => {
    const eventData = {
      type: "PLAYER_JOINED",
      tableId: "table-1",
      payload: { userId: "user-1" },
    };

    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // INSERT
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await eventStore.publishEvent(eventData);
    await new Promise((resolve) => setImmediate(resolve));

    expect(result.type).toBe(eventData.type);
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO events"), expect.any(Array));
    expect(redisClient.xAdd).toHaveBeenCalledTimes(2);
  });

  it('should return existing event for idempotency key', async () => {
    const eventData = {
      type: "PLAYER_JOINED",
      tableId: "table-1",
      payload: { userId: "user-1" },
      idempotencyKey: "key-1",
    };

    const existingEvent = {
      event_id: "existing-1",
      type: "PLAYER_JOINED",
      table_id: "table-1",
      hand_id: null,
      user_id: "user-1",
      seat_id: null,
      payload: { userId: "user-1" },
      timestamp: new Date(),
      sequence: null,
    };

    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [{ event_id: "existing-1" }] }); // idempotency lookup
    mockClient.query.mockResolvedValueOnce({ rows: [existingEvent] }); // existing event
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await eventStore.publishEvent(eventData);

    expect(result.eventId).toBe("existing-1");
    expect(mockClient.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO events"), expect.any(Array));
  });

  it('should error if idempotency key exists but event missing', async () => {
    const eventData = {
      type: "PLAYER_JOINED",
      tableId: "table-1",
      payload: { userId: "user-1" },
      idempotencyKey: "key-1",
    };

    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [{ event_id: "missing-1" }] }); // idempotency lookup
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // missing event

    await expect(eventStore.publishEvent(eventData)).rejects.toThrow(
      "Idempotency key exists but event is missing"
    );

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it('should query events successfully', async () => {
    const mockEvents = [{ event_id: "e1", type: "T1", table_id: "t1", payload: {}, timestamp: new Date(), sequence: 1 }];
    (pool.query as unknown).mockResolvedValueOnce({ rows: [{ count: "1" }] }); // COUNT
    (pool.query as unknown).mockResolvedValueOnce({ rows: mockEvents }); // SELECT

    const result = await eventStore.queryEvents({ tableId: "t1", limit: 10 });

    expect(result.events[0].eventId).toBe("e1");
    expect(result.total).toBe(1);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("SELECT COUNT(*)"), expect.any(Array));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("SELECT * FROM events"), expect.any(Array));
  });

  it('should get event by id', async () => {
    const mockEvent = { event_id: "e1", type: "T1", table_id: "t1", payload: {}, timestamp: new Date(), sequence: 1 };
    (pool.query as unknown).mockResolvedValueOnce({ rows: [mockEvent] });

    const result = await eventStore.getEventById("e1");

    expect(result?.eventId).toBe("e1");
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("SELECT * FROM events"), ["e1"]);
  });

  it('should return showdown reveals with seat ids', async () => {
    (pool.query as unknown).mockResolvedValueOnce({
      rows: [
        {
          payload: {
            reveals: [{ seatId: 1 }, { seat_id: 2 }, { seatId: "bad" }],
          },
        },
      ],
    });

    const result = await eventStore.getShowdownReveals("hand-1");

    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.size).toBe(2);
  });

  it('should rollback on error', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('DB Error'));

    await expect(
      eventStore.publishEvent({
        type: "TEST",
        tableId: "t1",
        payload: {},
      })
    ).rejects.toThrow("DB Error");

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });
});
