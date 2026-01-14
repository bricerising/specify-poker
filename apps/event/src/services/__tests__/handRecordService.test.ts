import { describe, it, expect, vi, beforeEach } from "vitest";
import { HandRecordService } from "../handRecordService";
import { handStore } from "../../storage/handStore";
import { privacyService } from "../privacyService";

vi.mock("../../storage/handStore", () => ({
  handStore: {
    getHandRecord: vi.fn(),
    getHandHistory: vi.fn(),
    getHandsForUser: vi.fn(),
  },
}));

vi.mock("../privacyService", () => ({
  privacyService: {
    filterHandRecord: vi.fn(),
  },
}));

describe("HandRecordService", () => {
  const service = new HandRecordService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a redacted hand record for non-operators", async () => {
    const record = {
      handId: "hand-1",
      tableId: "table-1",
      tableName: "Table 1",
      config: { smallBlind: 10, bigBlind: 20, ante: 0 },
      participants: [],
      communityCards: [],
      pots: [],
      winners: [],
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 1000,
    };

    vi.mocked(handStore.getHandRecord).mockResolvedValue(record as never);
    vi.mocked(privacyService.filterHandRecord).mockResolvedValue({
      ...record,
      tableName: "Redacted",
    } as never);

    const result = await service.getHandRecord("hand-1", "user-1", false);

    expect(handStore.getHandRecord).toHaveBeenCalledWith("hand-1");
    expect(privacyService.filterHandRecord).toHaveBeenCalledWith(record, "user-1", false);
    expect(result?.tableName).toBe("Redacted");
  });

  it("filters hand history to only participant hands", async () => {
    const hands = [
      {
        handId: "hand-1",
        tableId: "table-1",
        tableName: "Table 1",
        config: { smallBlind: 10, bigBlind: 20, ante: 0 },
        participants: [{ userId: "user-1" }],
        communityCards: [],
        pots: [],
        winners: [],
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 100,
      },
      {
        handId: "hand-2",
        tableId: "table-1",
        tableName: "Table 1",
        config: { smallBlind: 10, bigBlind: 20, ante: 0 },
        participants: [{ userId: "user-2" }],
        communityCards: [],
        pots: [],
        winners: [],
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 200,
      },
    ];

    vi.mocked(handStore.getHandHistory).mockResolvedValue({ hands: hands as never, total: 2 });
    vi.mocked(privacyService.filterHandRecord).mockImplementation(async (hand) => ({
      ...(hand as Record<string, unknown>),
      tableName: "Redacted",
    }));

    const result = await service.getHandHistory("table-1", 20, 0, "user-1", false);

    expect(result.hands).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.hands[0].handId).toBe("hand-1");
    expect(privacyService.filterHandRecord).toHaveBeenCalledTimes(1);
  });

  it("rejects requests for another user's hands", async () => {
    await expect(service.getHandsForUser("user-1", 20, 0, "user-2", false)).rejects.toThrow(
      "Requester not authorized for user hand history"
    );

    expect(handStore.getHandsForUser).not.toHaveBeenCalled();
  });

  it("returns unredacted results for operators", async () => {
    vi.mocked(handStore.getHandsForUser).mockResolvedValue({ hands: [], total: 0 });

    const result = await service.getHandsForUser("user-1", 20, 0, "operator-1", true);

    expect(result).toEqual({ hands: [], total: 0 });
    expect(privacyService.filterHandRecord).not.toHaveBeenCalled();
  });
});
