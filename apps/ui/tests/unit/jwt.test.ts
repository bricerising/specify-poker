import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeJwtUserId } from '../../src/utils/jwt';

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe('decodeJwtUserId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the sub claim', () => {
    const token = makeJwt({ sub: 'user-123' });
    expect(decodeJwtUserId(token)).toBe('user-123');
  });

  it('falls back when atob is unavailable', () => {
    const token = makeJwt({ sub: 'user-123' });
    vi.stubGlobal('atob', null as unknown as typeof atob);
    expect(decodeJwtUserId(token)).toBe('user-123');
  });

  it('returns null for invalid tokens', () => {
    expect(decodeJwtUserId('not-a-jwt')).toBeNull();
    expect(decodeJwtUserId('a.b')).toBeNull();
  });
});
