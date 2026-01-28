import { describe, expect, it } from 'vitest';

import {
  formatChips,
  formatChipsWithCommas,
  formatBlinds,
  calculatePotOdds,
  formatPotOdds,
  calculatePotSizeBet,
} from '../../src/utils/chipFormatter';

describe('formatChips', () => {
  it('returns raw number for small amounts', () => {
    expect(formatChips(0)).toBe('0');
    expect(formatChips(100)).toBe('100');
    expect(formatChips(999)).toBe('999');
  });

  it('formats thousands with K', () => {
    expect(formatChips(1000)).toBe('1K');
    expect(formatChips(1500)).toBe('1.5K');
    expect(formatChips(25000)).toBe('25K');
  });

  it('formats millions with M', () => {
    expect(formatChips(1000000)).toBe('1M');
    expect(formatChips(2500000)).toBe('2.5M');
  });
});

describe('formatChipsWithCommas', () => {
  it('formats with locale-specific separators', () => {
    expect(formatChipsWithCommas(1000)).toBe('1,000');
    expect(formatChipsWithCommas(1000000)).toBe('1,000,000');
  });
});

describe('formatBlinds', () => {
  it('formats blind levels', () => {
    expect(formatBlinds(5, 10)).toBe('5/10');
    expect(formatBlinds(50, 100)).toBe('50/100');
    expect(formatBlinds(500, 1000)).toBe('500/1K');
  });
});

describe('calculatePotOdds', () => {
  it('returns 0 when call amount is 0', () => {
    expect(calculatePotOdds(100, 0)).toBe(0);
    expect(calculatePotOdds(100, -10)).toBe(0);
  });

  it('calculates correct pot odds', () => {
    expect(calculatePotOdds(100, 50)).toBeCloseTo(0.333, 2);
    expect(calculatePotOdds(100, 100)).toBeCloseTo(0.5, 2);
  });
});

describe('formatPotOdds', () => {
  it('returns Free for 0 call', () => {
    expect(formatPotOdds(100, 0)).toBe('Free');
  });

  it('formats as percentage', () => {
    expect(formatPotOdds(100, 50)).toBe('33.3%');
  });
});

describe('calculatePotSizeBet', () => {
  it('calculates fraction of pot', () => {
    expect(calculatePotSizeBet(100, 0.5)).toBe(50);
    expect(calculatePotSizeBet(100, 0.75)).toBe(75);
    expect(calculatePotSizeBet(100, 1)).toBe(100);
  });

  it('floors the result', () => {
    expect(calculatePotSizeBet(100, 0.33)).toBe(33);
  });
});
