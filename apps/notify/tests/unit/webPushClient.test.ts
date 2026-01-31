import { beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

vi.mock('../../src/observability/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import logger from '../../src/observability/logger';
import { createRealWebPushClient, createWebPushClient } from '../../src/services/webPushClient';

describe('WebPushClient', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
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

  it('createWebPushClient returns a no-op client outside production when VAPID keys are missing', async () => {
    process.env.NODE_ENV = 'development';

    const client = createWebPushClient();
    await client.sendNotification(
      { endpoint: 'e1', keys: { p256dh: 'p', auth: 'a' } },
      'payload',
    );

    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect((logger as unknown as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledWith(
      'VAPID keys not set. Push notifications are disabled (no-op).',
    );
  });

  it('createWebPushClient returns a no-op client silently in test env when VAPID keys are missing', async () => {
    process.env.NODE_ENV = 'test';

    const client = createWebPushClient();
    await client.sendNotification(
      { endpoint: 'e1', keys: { p256dh: 'p', auth: 'a' } },
      'payload',
    );

    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect((logger as unknown as { warn: ReturnType<typeof vi.fn> }).warn).not.toHaveBeenCalled();
  });

  it('createWebPushClient returns a real client in production when VAPID keys are missing', async () => {
    process.env.NODE_ENV = 'production';

    const client = createWebPushClient();
    await client.sendNotification(
      { endpoint: 'e1', keys: { p256dh: 'p', auth: 'a' } },
      'payload',
    );

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect((logger as unknown as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledWith(
      'VAPID keys not set. Push notifications will fail.',
    );
  });

  it('createWebPushClient configures VAPID and returns a real client when keys are provided', async () => {
    process.env.NODE_ENV = 'development';

    const client = createWebPushClient({
      vapidDetails: {
        subject: 'mailto:admin@example.com',
        publicKey: 'pub',
        privateKey: 'priv',
      },
    });

    await client.sendNotification(
      { endpoint: 'e1', keys: { p256dh: 'p', auth: 'a' } },
      'payload',
    );

    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:admin@example.com', 'pub', 'priv');
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect((logger as unknown as { warn: ReturnType<typeof vi.fn> }).warn).not.toHaveBeenCalled();
  });
});
