import { describe, expect, it } from 'vitest';

import { parseCard, formatCard, formatCards } from '../../src/utils/cardRenderer';

describe('parseCard', () => {
  it('parses valid cards', () => {
    const card = parseCard('Ah');
    expect(card).not.toBeNull();
    expect(card?.rank).toBe('A');
    expect(card?.suit).toBe('h');
    expect(card?.suitSymbol).toBe('\u2665');
    expect(card?.suitColor).toBe('red');
  });

  it('parses all suits correctly', () => {
    expect(parseCard('Kh')?.suitColor).toBe('red');
    expect(parseCard('Kd')?.suitColor).toBe('red');
    expect(parseCard('Kc')?.suitColor).toBe('black');
    expect(parseCard('Ks')?.suitColor).toBe('black');
  });

  it('returns null for invalid cards', () => {
    expect(parseCard('')).toBeNull();
    expect(parseCard('A')).toBeNull();
    expect(parseCard('Ahh')).toBeNull();
    expect(parseCard('Ax')).toBeNull();
  });

  it('handles lowercase suits', () => {
    const card = parseCard('Ks');
    expect(card?.suit).toBe('s');
    expect(card?.suitSymbol).toBe('\u2660');
  });
});

describe('formatCard', () => {
  it('formats cards with suit symbols', () => {
    expect(formatCard('Ah')).toBe('A\u2665');
    expect(formatCard('Ks')).toBe('K\u2660');
    expect(formatCard('Td')).toBe('10\u2666');
    expect(formatCard('2c')).toBe('2\u2663');
  });

  it('returns original for invalid cards', () => {
    expect(formatCard('invalid')).toBe('invalid');
  });
});

describe('formatCards', () => {
  it('formats array of cards', () => {
    const result = formatCards(['Ah', 'Kd']);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('A\u2665');
    expect(result[1]).toBe('K\u2666');
  });
});
