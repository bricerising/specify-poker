import { describe, it, expect } from "vitest";
import { calculatePots, calculateRake } from "../../src/engine/potCalculator";

describe("potCalculator", () => {
  describe("calculatePots", () => {
    it("should return empty array when no contributions", () => {
      const contributions = {};
      const foldedSeats = new Set<number>();

      const pots = calculatePots(contributions, foldedSeats);
      expect(pots).toEqual([]);
    });

    it("should create single pot for equal contributions", () => {
      const contributions = { 0: 100, 1: 100, 2: 100 };
      const foldedSeats = new Set<number>();

      const pots = calculatePots(contributions, foldedSeats);
      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(300);
      expect(pots[0].eligibleSeats).toEqual([0, 1, 2]);
    });

    it("should create side pots for all-in situations", () => {
      const contributions = { 0: 50, 1: 100, 2: 100 };
      const foldedSeats = new Set<number>();

      const pots = calculatePots(contributions, foldedSeats);
      expect(pots).toHaveLength(2);
      // Main pot: 50 * 3 = 150
      expect(pots[0].amount).toBe(150);
      expect(pots[0].eligibleSeats).toEqual([0, 1, 2]);
      // Side pot: 50 * 2 = 100
      expect(pots[1].amount).toBe(100);
      expect(pots[1].eligibleSeats).toEqual([1, 2]);
    });

    it("should exclude folded players from pot eligibility", () => {
      const contributions = { 0: 100, 1: 100, 2: 100 };
      const foldedSeats = new Set<number>([1]);

      const pots = calculatePots(contributions, foldedSeats);
      expect(pots).toHaveLength(1);
      expect(pots[0].eligibleSeats).toEqual([0, 2]);
      // Amount still includes folded player's contribution
      expect(pots[0].amount).toBe(300);
    });

    it("should handle multiple all-in levels", () => {
      const contributions = { 0: 25, 1: 50, 2: 100, 3: 100 };
      const foldedSeats = new Set<number>();

      const pots = calculatePots(contributions, foldedSeats);
      expect(pots).toHaveLength(3);
      // First pot: 25 * 4 = 100
      expect(pots[0].amount).toBe(100);
      expect(pots[0].eligibleSeats).toEqual([0, 1, 2, 3]);
      // Second pot: 25 * 3 = 75
      expect(pots[1].amount).toBe(75);
      expect(pots[1].eligibleSeats).toEqual([1, 2, 3]);
      // Third pot: 50 * 2 = 100
      expect(pots[2].amount).toBe(100);
      expect(pots[2].eligibleSeats).toEqual([2, 3]);
    });

    it("should handle zero contributions", () => {
      const contributions = { 0: 0, 1: 100, 2: 100 };
      const foldedSeats = new Set<number>();

      const pots = calculatePots(contributions, foldedSeats);
      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(200);
    });
  });

  describe("calculateRake", () => {
    it("should return 0 for pots under 20", () => {
      expect(calculateRake(10, 5)).toBe(0);
      expect(calculateRake(20, 5)).toBe(0);
    });

    it("should return 0 when remaining cap is 0", () => {
      expect(calculateRake(100, 0)).toBe(0);
    });

    it("should calculate 5% rake", () => {
      expect(calculateRake(100, 10)).toBe(5);
      expect(calculateRake(200, 10)).toBe(10);
    });

    it("should respect remaining cap", () => {
      expect(calculateRake(200, 3)).toBe(3);
      expect(calculateRake(1000, 5)).toBe(5);
    });

    it("should floor the rake amount", () => {
      // 5% of 21 is 1.05, should floor to 1
      expect(calculateRake(21, 10)).toBe(1);
    });
  });
});
