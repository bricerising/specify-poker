import { describe, expect, it } from "vitest";

import {
  moderationRequestSchema,
  tableConfigSchema,
  tableJoinResponseSchema,
  tableSummarySchema,
  userProfileSchema,
} from "../src/schemas/index";

describe("shared schemas", () => {
  it("validates table config and summary", () => {
    const config = {
      smallBlind: 10,
      bigBlind: 20,
      ante: null,
      maxPlayers: 6,
      startingStack: 2000,
      bettingStructure: "NoLimit" as const,
    };

    const summary = {
      tableId: "table-1",
      name: "Friendly Table",
      config,
      seatsTaken: 0,
      inProgress: false,
    };

    expect(tableConfigSchema.parse(config)).toEqual(config);
    expect(tableSummarySchema.parse(summary)).toEqual(summary);
  });

  it("validates user profile and moderation request", () => {
    const profile = {
      userId: "user-1",
      nickname: "Dealer",
      avatarUrl: null,
      stats: {
        handsPlayed: 0,
        wins: 0,
      },
      friends: [],
    };

    expect(userProfileSchema.parse(profile)).toEqual(profile);
    expect(moderationRequestSchema.parse({ targetUserId: "user-2" })).toEqual({
      targetUserId: "user-2",
    });
  });

  it("validates table join response", () => {
    const payload = {
      tableId: "table-1",
      seatId: 2,
      wsUrl: "ws://localhost:4000/ws",
    };

    expect(tableJoinResponseSchema.parse(payload)).toEqual(payload);
  });
});
