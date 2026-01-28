import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useTimer } from '../../src/hooks/useTimer';

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns expired state when no deadline', () => {
    const { result } = renderHook(() => useTimer(null));

    expect(result.current.isExpired).toBe(true);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.formatted).toBe('--:--');
  });

  it('calculates remaining time correctly', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const deadline = new Date(now + 15000).toISOString();
    const { result } = renderHook(() => useTimer(deadline));

    expect(result.current.remainingSeconds).toBe(15);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.isUrgent).toBe(false);
    expect(result.current.isCritical).toBe(false);
  });

  it('marks urgent when under 10 seconds', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const deadline = new Date(now + 8000).toISOString();
    const { result } = renderHook(() => useTimer(deadline));

    expect(result.current.isUrgent).toBe(true);
    expect(result.current.isCritical).toBe(false);
  });

  it('marks critical when under 5 seconds', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const deadline = new Date(now + 3000).toISOString();
    const { result } = renderHook(() => useTimer(deadline));

    expect(result.current.isCritical).toBe(true);
  });

  it('formats time correctly', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const deadline = new Date(now + 65000).toISOString();
    const { result } = renderHook(() => useTimer(deadline));

    expect(result.current.formatted).toBe('1:05');
  });
});
