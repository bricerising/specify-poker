import { describe, it, expect, vi, beforeEach } from "vitest";
import { replayService } from "../replayService";
import { eventStore } from "../../storage/eventStore";

vi.mock("../../storage/eventStore", () => ({
  eventStore: {
    queryEvents: vi.fn(),
    getShowdownReveals: vi.fn(),
  },
}));

describe("ReplayService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redacts non-requester hole cards while preserving showdown reveals", async () => {
    const events = [
      {
        eventId: "e1",
        type: "HAND_STARTED",
        tableId: "table-1",
        handId: "hand-1",
        userId: null,
        seatId: null,
        payload: {
          seats: [
            { userId: "user-1", seatId: 1 },
            { userId: "user-2", seatId: 2 },
          ],
        },
        timestamp: new Date(),
        sequence: 1,
      },
      {
        eventId: "e2",
        type: "CARDS_DEALT",
        tableId: "table-1",
        handId: "hand-1",
        userId: "user-1",
        seatId: 1,
        payload: { cards: [{ rank: "A", suit: "s" }] },
        timestamp: new Date(),
        sequence: 2,
      },
      {
        eventId: "e3",
        type: "CARDS_DEALT",
        tableId: "table-1",
        handId: "hand-1",
        userId: "user-2",
        seatId: 2,
        payload: { cards: [{ rank: "K", suit: "d" }] },
        timestamp: new Date(),
        sequence: 3,
      },
      {
        eventId: "e4",
        type: "SHOWDOWN",
        tableId: "table-1",
        handId: "hand-1",
        userId: null,
        seatId: null,
        payload: {
          reveals: [
            { seatId: 1, cards: [{ rank: "A", suit: "s" }], handRank: "Pair" },
            { seatId: 2, cards: [{ rank: "K", suit: "d" }], handRank: "High Card" },
          ],
        },
        timestamp: new Date(),
        sequence: 4,
      },
    ];

    vi.mocked(eventStore.queryEvents).mockResolvedValue({
      events: events as never,
      total: events.length,
    });
    vi.mocked(eventStore.getShowdownReveals).mockResolvedValue(new Set([1, 2]));

    const result = await replayService.getHandEvents("hand-1", "user-1", false);

    const userEvent = result.find((event) => event.eventId === "e2");
    const otherEvent = result.find((event) => event.eventId === "e3");
    const showdownEvent = result.find((event) => event.eventId === "e4");

    expect((userEvent?.payload as { cards: unknown[] }).cards).toHaveLength(1);
    expect((otherEvent?.payload as { cards: unknown[] }).cards).toEqual([]);
    expect((showdownEvent?.payload as { reveals: { cards?: unknown[] }[] }).reveals[1].cards).toHaveLength(1);
  });

  it("redacts all hole cards for non-participants", async () => {
    const events = [
      {
        eventId: "e1",
        type: "HAND_STARTED",
        tableId: "table-1",
        handId: "hand-1",
        userId: null,
        seatId: null,
        payload: {
          seats: [{ userId: "user-1", seatId: 1 }],
        },
        timestamp: new Date(),
        sequence: 1,
      },
      {
        eventId: "e2",
        type: "CARDS_DEALT",
        tableId: "table-1",
        handId: "hand-1",
        userId: "user-1",
        seatId: 1,
        payload: { cards: [{ rank: "A", suit: "s" }] },
        timestamp: new Date(),
        sequence: 2,
      },
    ];

    vi.mocked(eventStore.queryEvents).mockResolvedValue({
      events: events as never,
      total: events.length,
    });
    vi.mocked(eventStore.getShowdownReveals).mockResolvedValue(new Set());

    const result = await replayService.getHandEvents("hand-1", "outsider", false);

    expect((result[1].payload as { cards: unknown[] }).cards).toEqual([]);
  });
});
