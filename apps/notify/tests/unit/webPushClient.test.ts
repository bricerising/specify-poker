import { beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import { createRealWebPushClient } from '../../src/services/webPushClient';

describe('WebPushClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok for successful sends', async () => {
    (webpush.sendNotification as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const client = createRealWebPushClient();
    const result = await client.sendNotification(
      { endpoint: 'e1', keys: { p256dh: 'p', auth: 'a' } },
      'payload',
    );

    expect(result.ok).toBe(true);
  });

  it('maps 410/404 errors to ExpiredSubscription', async () => {
    (webpush.sendNotification as unknown as ReturnType<typeof vi.fn>).mockRejectedValue({
      statusCode: 410,
    });

    const client = createRealWebPushClient();
    const result = await client.sendNotification(
      { endpoint: 'e1', keys: { p256dh: 'p', auth: 'a' } },
      'payload',
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected a WebPushSendError');
    }

    expect(result.error.type).toBe('ExpiredSubscription');
    expect(result.error.statusCode).toBe(410);
  });

  it('maps unknown errors to SendFailed', async () => {
    (webpush.sendNotification as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );

    const client = createRealWebPushClient();
    const result = await client.sendNotification(
      { endpoint: 'e1', keys: { p256dh: 'p', auth: 'a' } },
      'payload',
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected a WebPushSendError');
    }

    expect(result.error.type).toBe('SendFailed');
    expect(result.error.statusCode).toBe(null);
    expect(result.error.message).toBe('boom');
  });
});

