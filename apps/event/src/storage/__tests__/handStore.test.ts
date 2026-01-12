import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { HandStore } from "../handStore";
import pool from "../pgClient";

vi.mock('../pgClient', () => ({
  default: {
    query: vi.fn(),
  },
}));

const mockQuery = pool.query as Mock;

describe('HandStore', () => {
  let handStore: HandStore;

  beforeEach(() => {
    vi.clearAllMocks();
    handStore = new HandStore();
  });

  it('should save a hand record successfully', async () => {
    const record: unknown = {
      handId: "hand-1",
      tableId: "table-1",
      tableName: "Table 1",
      config: {},
      participants: [],
      communityCards: [],
      pots: [],
      winners: [],
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 1000,
    };

    mockQuery.mockResolvedValueOnce({ rows: [] });

    await handStore.saveHandRecord(record);

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO hand_records"), expect.any(Array));
  });

  it('should get a hand record', async () => {
    const record = {
      hand_id: "hand-1",
      table_id: "table-1",
      table_name: "Table 1",
      config: {},
      participants: [],
      community_cards: [],
      pots: [],
      winners: [],
      started_at: new Date(),
      completed_at: new Date(),
      duration: 100,
    };
    mockQuery.mockResolvedValueOnce({ rows: [record] });

    const result = await handStore.getHandRecord("hand-1");

    expect(result?.handId).toBe("hand-1");
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("SELECT * FROM hand_records"), ["hand-1"]);
  });

  it('should get hand history', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          hand_id: "h1",
          table_id: "t1",
          table_name: "Table",
          config: {},
          participants: [],
          community_cards: [],
          pots: [],
          winners: [],
          started_at: new Date(),
          completed_at: new Date(),
          duration: 1,
        },
      ],
    });

    const result = await handStore.getHandHistory("t1");

    expect(result.total).toBe(1);
    expect(result.hands[0].handId).toBe("h1");
  });

  it('should get hands for user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "1" }] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          hand_id: "h1",
          table_id: "t1",
          table_name: "Table",
          config: {},
          participants: [],
          community_cards: [],
          pots: [],
          winners: [],
          started_at: new Date(),
          completed_at: new Date(),
          duration: 1,
        },
      ],
    });

    const result = await handStore.getHandsForUser("u1");

    expect(result.total).toBe(1);
    expect(result.hands[0].handId).toBe("h1");
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("participants @>"), expect.any(Array));
  });
});
