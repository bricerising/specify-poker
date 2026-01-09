import { describe, expect, it } from "vitest";

import { evaluateBestHand, evaluateWinners } from "../../src/engine/handEval";

describe("hand evaluation", () => {
  it("ranks a straight flush above other hands", () => {
    const rank = evaluateBestHand(["AS", "KS", "QS", "JS", "TS", "2D", "3C"]);
    expect(rank.category).toBe(8);
    expect(rank.tiebreaker[0]).toBe(14);
  });

  it("selects winner based on best hand", () => {
    const players = {
      0: ["AH", "AD"],
      1: ["KH", "9D"],
    };
    const community = ["2C", "7S", "9H", "JC", "3D"];

    const result = evaluateWinners(players, community);
    expect(result.winners).toEqual([0]);
  });
});
