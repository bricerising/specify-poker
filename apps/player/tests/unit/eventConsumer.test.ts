import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventConsumer } from "../../src/services/eventConsumer";
import * as statisticsService from "../../src/services/statisticsService";

vi.mock("../../src/services/statisticsService", () => ({
  incrementHandsPlayed: vi.fn(),
  incrementWins: vi.fn(),
}));

vi.mock("../../src/storage/redisClient", () => ({
  getRedisClient: vi.fn(),
}));

describe("EventConsumer", () => {
  let consumer: EventConsumer;

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = new EventConsumer();
  });

  describe("handleEvent", () => {
    it("should record hands played on HAND_STARTED", async () => {
      const event = {
        type: "HAND_STARTED",
        payload: {
          fields: {
            participants: {
              listValue: {
                values: [{ stringValue: "user1" }, { stringValue: "user2" }],
              },
            },
          },
        },
      };

      await (consumer as unknown as { handleEvent: (event: unknown) => Promise<void> }).handleEvent(event);

      expect(statisticsService.incrementHandsPlayed).toHaveBeenCalledWith("user1");
      expect(statisticsService.incrementHandsPlayed).toHaveBeenCalledWith("user2");
    });

    it("should record wins on HAND_ENDED", async () => {
      const event = {
        type: "HAND_ENDED",
        payload: {
          fields: {
            winnerUserIds: {
              listValue: {
                values: [{ stringValue: "user1" }],
              },
            },
          },
        },
      };

      await (consumer as unknown as { handleEvent: (event: unknown) => Promise<void> }).handleEvent(event);

      expect(statisticsService.incrementWins).toHaveBeenCalledWith("user1");
    });
  });
});
