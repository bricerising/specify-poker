import { describe, expect, it } from 'vitest';

import { readJwtHeaderKid } from '../src/auth/jwtKid';

function base64UrlEncode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createTestJwt(header: Record<string, unknown>): string {
  const headerSegment = base64UrlEncode({ typ: 'JWT', alg: 'RS256', ...header });
  const payloadSegment = base64UrlEncode({});
  return `${headerSegment}.${payloadSegment}.sig`;
}

describe('readJwtHeaderKid', () => {
  it('returns kid from the JWT header', () => {
    expect(readJwtHeaderKid(createTestJwt({ kid: 'kid-1' }))).toBe('kid-1');
  });

  it('returns null when the header has no kid', () => {
    expect(readJwtHeaderKid(createTestJwt({}))).toBeNull();
  });

  it('returns null for malformed tokens', () => {
    expect(readJwtHeaderKid('not-a-jwt')).toBeNull();
    expect(readJwtHeaderKid('..')).toBeNull();
  });

  it('returns null for non-JSON headers', () => {
    const headerSegment = Buffer.from('not-json', 'utf8').toString('base64url');
    expect(readJwtHeaderKid(`${headerSegment}.payload.sig`)).toBeNull();
  });
});
