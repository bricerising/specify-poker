import { describe, it, expect } from "vitest";
import { deriveLegalActions, validateAction, getCallAmount } from "../../src/engine/actionRules";
import { HandState, Seat } from "../../src/domain/types";

describe("actionRules", () => {
  const createHandState = (overrides: Partial<HandState> = {}): HandState => ({
    handId: "hand-1",
    tableId: "table-1",
    street: "PREFLOP",
    communityCards: [],
    pots: [],
    currentBet: 20,
    minRaise: 20,
    bigBlind: 20,
    turn: 0,
    lastAggressor: 1,
    actions: [],
    rakeAmount: 0,
    startedAt: new Date().toISOString(),
    deck: [],
    roundContributions: { 0: 0, 1: 20 },
    totalContributions: { 0: 0, 1: 20 },
    actedSeats: [],
    raiseCapped: false,
    ...overrides,
  });

  const createSeat = (overrides: Partial<Seat> = {}): Seat => ({
    seatId: 0,
    userId: "user-1",
    stack: 1000,
    status: "ACTIVE",
    holeCards: [{ rank: "A", suit: "spades" }, { rank: "K", suit: "hearts" }],
    ...overrides,
  });

  describe("getCallAmount", () => {
    it("should calculate call amount correctly", () => {
      const hand = createHandState({ currentBet: 20, roundContributions: { 0: 0, 1: 20 } });
      const seat = createSeat({ seatId: 0 });

      expect(getCallAmount(hand, seat)).toBe(20);
    });

    it("should return 0 when already matched bet", () => {
      const hand = createHandState({ currentBet: 20, roundContributions: { 0: 20, 1: 20 } });
      const seat = createSeat({ seatId: 0 });

      expect(getCallAmount(hand, seat)).toBe(0);
    });

    it("should calculate partial call amount", () => {
      const hand = createHandState({ currentBet: 40, roundContributions: { 0: 10, 1: 40 } });
      const seat = createSeat({ seatId: 0 });

      expect(getCallAmount(hand, seat)).toBe(30);
    });
  });

  describe("deriveLegalActions", () => {
    it("should return empty array for non-active seat", () => {
      const hand = createHandState();
      const seat = createSeat({ status: "FOLDED" });

      expect(deriveLegalActions(hand, seat)).toEqual([]);
    });

    it("should include FOLD for active seat", () => {
      const hand = createHandState();
      const seat = createSeat();

      const actions = deriveLegalActions(hand, seat);
      expect(actions.some(a => a.type === "FOLD")).toBe(true);
    });

    it("should include CHECK when no bet to call", () => {
      const hand = createHandState({ currentBet: 0, roundContributions: { 0: 0 } });
      const seat = createSeat();

      const actions = deriveLegalActions(hand, seat);
      expect(actions.some(a => a.type === "CHECK")).toBe(true);
    });

    it("should include CALL when there is a bet", () => {
      const hand = createHandState({ currentBet: 20, roundContributions: { 0: 0 } });
      const seat = createSeat();

      const actions = deriveLegalActions(hand, seat);
      const callAction = actions.find(a => a.type === "CALL");
      expect(callAction).toBeDefined();
      expect(callAction?.maxAmount).toBe(20);
    });

    it("should include BET when no current bet", () => {
      const hand = createHandState({ currentBet: 0 });
      const seat = createSeat();

      const actions = deriveLegalActions(hand, seat);
      const betAction = actions.find(a => a.type === "BET");
      expect(betAction).toBeDefined();
      expect(betAction?.minAmount).toBe(20); // minRaise
      expect(betAction?.maxAmount).toBe(1000); // stack
    });

    it("should include RAISE when there is a bet", () => {
      const hand = createHandState({ currentBet: 20, roundContributions: { 0: 0 } });
      const seat = createSeat();

      const actions = deriveLegalActions(hand, seat);
      const raiseAction = actions.find(a => a.type === "RAISE");
      expect(raiseAction).toBeDefined();
      expect(raiseAction?.minAmount).toBe(40); // currentBet + minRaise
    });

    it("should include ALL_IN", () => {
      const hand = createHandState();
      const seat = createSeat();

      const actions = deriveLegalActions(hand, seat);
      expect(actions.some(a => a.type === "ALL_IN")).toBe(true);
    });

    it("should not include RAISE when raise is capped and player has acted", () => {
      const hand = createHandState({ raiseCapped: true, actedSeats: [0] });
      const seat = createSeat({ seatId: 0 });

      const actions = deriveLegalActions(hand, seat);
      expect(actions.some(a => a.type === "RAISE")).toBe(false);
    });
  });

  describe("validateAction", () => {
    it("should reject action when hand is at showdown", () => {
      const hand = createHandState({ street: "SHOWDOWN" });
      const seat = createSeat();

      const result = validateAction(hand, seat, { type: "FOLD" });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("HAND_COMPLETE");
    });

    it("should reject action for inactive seat", () => {
      const hand = createHandState();
      const seat = createSeat({ status: "FOLDED" });

      const result = validateAction(hand, seat, { type: "FOLD" });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("SEAT_INACTIVE");
    });

    it("should accept valid FOLD", () => {
      const hand = createHandState();
      const seat = createSeat();

      const result = validateAction(hand, seat, { type: "FOLD" });
      expect(result.ok).toBe(true);
    });

    it("should accept valid CHECK when no bet", () => {
      const hand = createHandState({ currentBet: 0 });
      const seat = createSeat();

      const result = validateAction(hand, seat, { type: "CHECK" });
      expect(result.ok).toBe(true);
    });

    it("should reject CHECK when there is a bet to call", () => {
      const hand = createHandState({ currentBet: 20, roundContributions: { 0: 0 } });
      const seat = createSeat();

      const result = validateAction(hand, seat, { type: "CHECK" });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("ILLEGAL_ACTION");
    });

    it("should require amount for BET", () => {
      const hand = createHandState({ currentBet: 0 });
      const seat = createSeat();

      const result = validateAction(hand, seat, { type: "BET" });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("MISSING_AMOUNT");
    });

    it("should reject BET that is too small", () => {
      const hand = createHandState({ currentBet: 0, minRaise: 20 });
      const seat = createSeat();

      const result = validateAction(hand, seat, { type: "BET", amount: 10 });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("AMOUNT_TOO_SMALL");
    });

    it("should reject BET that is too large", () => {
      const hand = createHandState({ currentBet: 0 });
      const seat = createSeat({ stack: 100 });

      const result = validateAction(hand, seat, { type: "BET", amount: 200 });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("AMOUNT_TOO_LARGE");
    });

    it("should accept valid BET", () => {
      const hand = createHandState({ currentBet: 0 });
      const seat = createSeat();

      const result = validateAction(hand, seat, { type: "BET", amount: 50 });
      expect(result.ok).toBe(true);
    });
  });
});
