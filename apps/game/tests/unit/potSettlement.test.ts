import { describe, expect, it } from 'vitest';
import { calculatePotPayouts, orderSeatIdsFromButton } from '../../src/engine/potSettlement';

describe('potSettlement', () => {
  describe('orderSeatIdsFromButton', () => {
    it('orders seat ids by distance from the button', () => {
      expect(orderSeatIdsFromButton([2, 7, 5, 6], 5, 9)).toEqual([5, 6, 7, 2]);
    });
  });

  describe('calculatePotPayouts', () => {
    it('splits the pot and assigns remainder in button order', () => {
      expect(
        calculatePotPayouts({
          amount: 5,
          winnerSeatIds: [2, 7],
          buttonSeat: 5,
          seatCount: 9,
        }),
      ).toEqual([
        { seatId: 7, amount: 3 },
        { seatId: 2, amount: 2 },
      ]);
    });

    it('returns empty payouts when amount is 0', () => {
      expect(
        calculatePotPayouts({
          amount: 0,
          winnerSeatIds: [0],
          buttonSeat: 0,
          seatCount: 9,
        }),
      ).toEqual([]);
    });
  });
});
