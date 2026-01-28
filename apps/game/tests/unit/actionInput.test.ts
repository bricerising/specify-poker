import { describe, expect, it } from 'vitest';

import { parseActionInput } from '../../src/domain/actionInput';

describe('parseActionInput', () => {
  it('normalizes and parses action type (case-insensitive)', () => {
    const result = parseActionInput({ actionType: 'fold' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ type: 'FOLD' });
    }
  });

  it('rejects unknown action types', () => {
    const result = parseActionInput({ actionType: 'dance' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('ILLEGAL_ACTION');
    }
  });

  it('requires amount for BET', () => {
    const result = parseActionInput({ actionType: 'BET' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('MISSING_AMOUNT');
      expect(result.error.actionType).toBe('BET');
    }
  });

  it('parses numeric string amounts for RAISE', () => {
    const result = parseActionInput({ actionType: 'RAISE', amount: '42' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ type: 'RAISE', amount: 42 });
    }
  });

  it('rejects invalid amounts for BET', () => {
    const result = parseActionInput({ actionType: 'BET', amount: 'not-a-number' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('INVALID_AMOUNT');
      expect(result.error.actionType).toBe('BET');
    }
  });

  it('does not require amount for ALL_IN', () => {
    const result = parseActionInput({ actionType: 'ALL_IN' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ type: 'ALL_IN' });
    }
  });
});
