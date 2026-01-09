import { describe, expect, it } from "vitest";

import { deriveLegalActions } from "../../src/state/deriveLegalActions";

describe("deriveLegalActions", () => {
  it("returns call and raise when facing a bet", () => {
    const actions = deriveLegalActions(
      {
        hand: {
          currentBet: 10,
          minRaise: 10,
          currentTurnSeat: 0,
          roundContributions: { 0: 0 },
          bigBlind: 10,
        },
        seats: [{ seatId: 0, userId: "u1", stack: 100, status: "active" }],
      },
      0,
    );

    const types = actions.map((action) => action.type);
    expect(types).toContain("Call");
    expect(types).toContain("Raise");
  });
});
