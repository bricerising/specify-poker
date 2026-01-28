import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage } from 'http';
import { authenticateWs, authenticateWsToken } from '../../../src/ws/auth';

vi.mock('../../../src/auth/jwt', () => ({
  verifyToken: vi.fn(),
}));

vi.mock('../../../src/observability/logger', () => ({
  default: {
    warn: vi.fn(),
  },
}));

import { verifyToken } from '../../../src/auth/jwt';

function makeRequest(url?: string, host = 'localhost') {
  return { url, headers: { host } } as IncomingMessage;
}

describe('WS auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns missing when token is absent', async () => {
    const result = await authenticateWs(makeRequest('/ws'));
    expect(result).toEqual({ status: 'missing' });
  });

  it('returns ok when token is valid', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'user-1' });
    const result = await authenticateWs(makeRequest('/ws?token=good'));
    expect(result).toEqual({ status: 'ok', userId: 'user-1' });
  });

  it('returns invalid when token is rejected', async () => {
    vi.mocked(verifyToken).mockRejectedValue(new Error('bad token'));
    const result = await authenticateWs(makeRequest('/ws?token=bad'));
    expect(result).toEqual({ status: 'invalid', reason: 'invalid_token' });
  });

  it('returns invalid when token lacks subject', async () => {
    vi.mocked(verifyToken).mockResolvedValue({});
    const result = await authenticateWs(makeRequest('/ws?token=missing'));
    expect(result).toEqual({ status: 'invalid', reason: 'invalid_token' });
  });

  it('rejects empty token in auth message flow', async () => {
    const result = await authenticateWsToken('');
    expect(result).toEqual({ status: 'invalid', reason: 'missing_token' });
  });

  it('accepts token in auth message flow', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'user-2' });
    const result = await authenticateWsToken('good');
    expect(result).toEqual({ status: 'ok', userId: 'user-2' });
  });
});
