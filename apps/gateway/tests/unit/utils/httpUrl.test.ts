import { describe, expect, it } from 'vitest';
import { toHttpUrl } from '../../../src/utils/httpUrl';

describe('toHttpUrl', () => {
  it('adds http:// when protocol is missing', () => {
    expect(toHttpUrl('balance:3002')).toBe('http://balance:3002');
  });

  it('preserves http:// and https:// targets', () => {
    expect(toHttpUrl('http://balance:3002')).toBe('http://balance:3002');
    expect(toHttpUrl('https://balance:3002')).toBe('https://balance:3002');
  });

  it('trims whitespace', () => {
    expect(toHttpUrl('  balance:3002  ')).toBe('http://balance:3002');
  });

  it('returns an empty string when blank', () => {
    expect(toHttpUrl('   ')).toBe('');
  });
});
