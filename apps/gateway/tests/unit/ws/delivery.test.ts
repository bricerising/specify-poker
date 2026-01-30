import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/ws/subscriptions', () => ({
  getSubscribers: vi.fn(),
}));

vi.mock('../../../src/ws/localRegistry', () => ({
  sendToLocalText: vi.fn(),
}));

vi.mock('../../../src/observability/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

describe('ws/delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('no-ops when there are no subscribers', async () => {
    const { deliverToSubscribers } = await import('../../../src/ws/delivery');
    const { getSubscribers } = await import('../../../src/ws/subscriptions');
    const { sendToLocalText } = await import('../../../src/ws/localRegistry');

    vi.mocked(getSubscribers).mockResolvedValue([]);

    await deliverToSubscribers('table:t1', { type: 'TablePatch' });

    expect(sendToLocalText).not.toHaveBeenCalled();
  });

  it('serializes and delivers messages to all subscribers', async () => {
    const { deliverToSubscribers } = await import('../../../src/ws/delivery');
    const { getSubscribers } = await import('../../../src/ws/subscriptions');
    const { sendToLocalText } = await import('../../../src/ws/localRegistry');

    vi.mocked(getSubscribers).mockResolvedValue(['conn-1', 'conn-2']);

    const payload = { type: 'ChatMessage', tableId: 't1', text: 'hello' };
    await deliverToSubscribers('chat:t1', payload);

    const serialized = JSON.stringify(payload);
    expect(sendToLocalText).toHaveBeenCalledWith('conn-1', serialized);
    expect(sendToLocalText).toHaveBeenCalledWith('conn-2', serialized);
  });

  it('logs and bails when payload serialization fails', async () => {
    const { deliverToSubscribers } = await import('../../../src/ws/delivery');
    const { getSubscribers } = await import('../../../src/ws/subscriptions');
    const { sendToLocalText } = await import('../../../src/ws/localRegistry');
    const { default: logger } = await import('../../../src/observability/logger');

    vi.mocked(getSubscribers).mockResolvedValue(['conn-1']);

    const payload: Record<string, unknown> = {};
    payload.self = payload;

    await deliverToSubscribers('table:t1', payload);

    expect(sendToLocalText).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'table:t1' }),
      'ws.delivery.serialize.failed',
    );
  });
});

