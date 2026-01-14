import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrivacyService } from "../privacyService";
import { eventStore } from "../../storage/eventStore";

vi.mock("../../storage/eventStore", () => ({
  eventStore: {
    getShowdownReveals: vi.fn(),
  },
}));

describe("PrivacyService", () => {
  const service = new PrivacyService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redacts all hole cards for non-participants", async () => {
    const record = {
      handId: "hand-1",
      participants: [
        { seatId: 1, userId: "user-1", holeCards: [{ rank: "A", suit: "s" }] },
        { seatId: 2, userId: "user-2", holeCards: [{ rank: "K", suit: "d" }] },
      ],
    };

    const result = await service.filterHandRecord(record as never, "outsider", false);

    expect(result.participants[0].holeCards).toBeNull();
    expect(result.participants[1].holeCards).toBeNull();
    expect(eventStore.getShowdownReveals).not.toHaveBeenCalled();
  });

  it("keeps revealed showdown cards for participants", async () => {
    const record = {
      handId: "hand-1",
      participants: [
        { seatId: 1, userId: "user-1", holeCards: [{ rank: "A", suit: "s" }] },
        { seatId: 2, userId: "user-2", holeCards: [{ rank: "K", suit: "d" }] },
        { seatId: 3, userId: "user-3", holeCards: [{ rank: "Q", suit: "h" }] },
      ],
    };

    vi.mocked(eventStore.getShowdownReveals).mockResolvedValue(new Set([2]));

    const result = await service.filterHandRecord(record as never, "user-1", false);

    expect(result.participants[0].holeCards).toHaveLength(1);
    expect(result.participants[1].holeCards).toHaveLength(1);
    expect(result.participants[2].holeCards).toBeNull();
  });

  it("redacts event payloads for non-participants", () => {
    const dealtEvent = service.filterEvent(
      {
        eventId: "e1",
        type: "CARDS_DEALT",
        tableId: "table-1",
        handId: "hand-1",
        userId: "user-1",
        seatId: 1,
        payload: { cards: [{ rank: "A", suit: "s" }] },
        timestamp: new Date(),
        sequence: 1,
      },
      "outsider",
      false,
      new Set(["user-1"])
    );

    const showdownEvent = service.filterEvent(
      {
        eventId: "e2",
        type: "SHOWDOWN",
        tableId: "table-1",
        handId: "hand-1",
        userId: null,
        seatId: null,
        payload: { reveals: [{ seatId: 1, cards: [{ rank: "A", suit: "s" }] }] },
        timestamp: new Date(),
        sequence: 2,
      },
      "outsider",
      false,
      new Set(["user-1"])
    );

    expect((dealtEvent.payload as { cards: unknown[] }).cards).toEqual([]);
    expect((showdownEvent.payload as { reveals: { cards?: unknown[] }[] }).reveals[0].cards).toEqual([]);
  });

  it("keeps a participant's own cards but redacts others before showdown", () => {
    const event = service.filterEvent(
      {
        eventId: "e1",
        type: "CARDS_DEALT",
        tableId: "table-1",
        handId: "hand-1",
        userId: "user-2",
        seatId: 2,
        payload: { cards: [{ rank: "K", suit: "d" }] },
        timestamp: new Date(),
        sequence: 1,
      },
      "user-1",
      false,
      new Set(["user-1", "user-2"])
    );

    expect((event.payload as { cards: unknown[] }).cards).toEqual([]);
  });

  it("does not redact showdown data for participants", () => {
    const event = service.filterEvent(
      {
        eventId: "e2",
        type: "SHOWDOWN",
        tableId: "table-1",
        handId: "hand-1",
        userId: null,
        seatId: null,
        payload: { reveals: [{ seatId: 1, cards: [{ rank: "A", suit: "s" }] }] },
        timestamp: new Date(),
        sequence: 2,
      },
      "user-1",
      false,
      new Set(["user-1"]),
      new Set([1])
    );

    expect((event.payload as { reveals: { cards?: unknown[] }[] }).reveals[0].cards).toHaveLength(1);
  });
});
