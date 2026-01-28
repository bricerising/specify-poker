import { describe, it, expect } from 'vitest';
import { evaluateFiveCardHand, evaluateBestHand, evaluateWinners } from '../../src/engine/rankings';
import type { Card } from '../../src/domain/types';

describe('rankings', () => {
  describe('evaluateFiveCardHand', () => {
    it('should identify high card', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
        { rank: 'J', suit: 'spades' },
        { rank: '9', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(0); // High card
      expect(rank.tiebreaker[0]).toBe(14); // Ace high
    });

    it('should identify one pair', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'K', suit: 'clubs' },
        { rank: 'Q', suit: 'spades' },
        { rank: 'J', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(1); // One pair
      expect(rank.tiebreaker[0]).toBe(14); // Pair of Aces
    });

    it('should identify two pair', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'K', suit: 'clubs' },
        { rank: 'K', suit: 'spades' },
        { rank: 'Q', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(2); // Two pair
    });

    it('should identify three of a kind', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'clubs' },
        { rank: 'K', suit: 'spades' },
        { rank: 'Q', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(3); // Three of a kind
    });

    it('should identify straight', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
        { rank: 'J', suit: 'spades' },
        { rank: '10', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(4); // Straight
      expect(rank.tiebreaker[0]).toBe(14); // Ace high straight
    });

    it('should identify wheel straight (A-2-3-4-5)', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: '2', suit: 'diamonds' },
        { rank: '3', suit: 'clubs' },
        { rank: '4', suit: 'spades' },
        { rank: '5', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(4); // Straight
      expect(rank.tiebreaker[0]).toBe(5); // 5-high straight (wheel)
    });

    it('should identify flush', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '9', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(5); // Flush
    });

    it('should identify full house', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'clubs' },
        { rank: 'K', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(6); // Full house
    });

    it('should identify four of a kind', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'clubs' },
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(7); // Four of a kind
    });

    it('should identify straight flush', () => {
      const cards: Card[] = [
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'hearts' },
        { rank: '9', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(8); // Straight flush
    });

    it('should identify royal flush', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'hearts' },
      ];

      const rank = evaluateFiveCardHand(cards);
      expect(rank.category).toBe(8); // Straight flush
      expect(rank.tiebreaker[0]).toBe(14); // Ace high
    });
  });

  describe('evaluateBestHand', () => {
    it('should find best 5-card hand from 7 cards', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'hearts' },
        { rank: '2', suit: 'clubs' },
        { rank: '3', suit: 'diamonds' },
      ];

      const rank = evaluateBestHand(cards);
      expect(rank.category).toBe(8); // Straight flush (royal flush)
    });

    it('should consider all combinations', () => {
      const cards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'clubs' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
        { rank: 'J', suit: 'spades' },
      ];

      const rank = evaluateBestHand(cards);
      expect(rank.category).toBe(6); // Full house (AAA KK)
    });
  });

  describe('evaluateWinners', () => {
    it('should determine single winner', () => {
      const communityCards: Card[] = [
        { rank: '2', suit: 'clubs' },
        { rank: '3', suit: 'diamonds' },
        { rank: '4', suit: 'spades' },
        { rank: '7', suit: 'hearts' },
        { rank: '8', suit: 'clubs' },
      ];

      const players: Record<number, Card[]> = {
        0: [
          { rank: 'A', suit: 'hearts' },
          { rank: 'K', suit: 'hearts' },
        ], // Ace high
        1: [
          { rank: 'Q', suit: 'hearts' },
          { rank: 'J', suit: 'hearts' },
        ], // Queen high
      };

      const result = evaluateWinners(players, communityCards);
      expect(result.winners).toEqual([0]);
    });

    it('should handle split pots', () => {
      const communityCards: Card[] = [
        { rank: 'A', suit: 'clubs' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'Q', suit: 'spades' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'clubs' },
      ];

      // Both players have Broadway straight on the board
      const players: Record<number, Card[]> = {
        0: [
          { rank: '2', suit: 'hearts' },
          { rank: '3', suit: 'hearts' },
        ],
        1: [
          { rank: '4', suit: 'hearts' },
          { rank: '5', suit: 'hearts' },
        ],
      };

      const result = evaluateWinners(players, communityCards);
      expect(result.winners).toHaveLength(2);
      expect(result.winners).toContain(0);
      expect(result.winners).toContain(1);
    });

    it('should compare same hand categories correctly', () => {
      const communityCards: Card[] = [
        { rank: '2', suit: 'clubs' },
        { rank: '3', suit: 'diamonds' },
        { rank: '4', suit: 'spades' },
        { rank: '7', suit: 'hearts' },
        { rank: '8', suit: 'clubs' },
      ];

      const players: Record<number, Card[]> = {
        0: [
          { rank: 'A', suit: 'hearts' },
          { rank: 'A', suit: 'diamonds' },
        ], // Pair of Aces
        1: [
          { rank: 'K', suit: 'hearts' },
          { rank: 'K', suit: 'diamonds' },
        ], // Pair of Kings
      };

      const result = evaluateWinners(players, communityCards);
      expect(result.winners).toEqual([0]); // Aces win
    });
  });
});
