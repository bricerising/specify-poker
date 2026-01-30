import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Broadcast service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('broadcasts table updates via delivery and publisher', async () => {
    const { createBroadcastService } = await import('../../../src/services/broadcastService');

    const deliverToSubscribers = vi.fn().mockResolvedValue(undefined);
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const logger = { warn: vi.fn(), error: vi.fn() };

    const service = createBroadcastService({ deliverToSubscribers, publisher, logger });

    const payload = { type: 'TablePatch', tableId: 't1' };
    await service.broadcastToChannel('table:t1', payload);

    expect(deliverToSubscribers).toHaveBeenCalledWith('table:t1', payload);
    expect(publisher.publish).toHaveBeenCalledWith({ kind: 'table', tableId: 't1' }, payload);
  });

  it('broadcasts chat updates via delivery and publisher', async () => {
    const { createBroadcastService } = await import('../../../src/services/broadcastService');

    const deliverToSubscribers = vi.fn().mockResolvedValue(undefined);
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const logger = { warn: vi.fn(), error: vi.fn() };

    const service = createBroadcastService({ deliverToSubscribers, publisher, logger });

    const payload = { type: 'ChatMessage', tableId: 't2' };
    await service.broadcastToChannel('chat:t2', payload);

    expect(deliverToSubscribers).toHaveBeenCalledWith('chat:t2', payload);
    expect(publisher.publish).toHaveBeenCalledWith({ kind: 'chat', tableId: 't2' }, payload);
  });

  it('broadcasts lobby updates via delivery and publisher', async () => {
    const { createBroadcastService } = await import('../../../src/services/broadcastService');

    const deliverToSubscribers = vi.fn().mockResolvedValue(undefined);
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const logger = { warn: vi.fn(), error: vi.fn() };

    const service = createBroadcastService({ deliverToSubscribers, publisher, logger });

    const tables = [{ table_id: 't1' }];
    const payload = { type: 'LobbyTablesUpdated', tables };
    await service.broadcastToChannel('lobby', payload);

    expect(deliverToSubscribers).toHaveBeenCalledWith('lobby', payload);
    expect(publisher.publish).toHaveBeenCalledWith({ kind: 'lobby' }, payload);
  });

  it('warns and skips publish when channel is unknown', async () => {
    const { createBroadcastService } = await import('../../../src/services/broadcastService');

    const deliverToSubscribers = vi.fn().mockResolvedValue(undefined);
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const logger = { warn: vi.fn(), error: vi.fn() };

    const service = createBroadcastService({ deliverToSubscribers, publisher, logger });

    await service.broadcastToChannel('bogus:t1', { type: 'TablePatch' });

    expect(deliverToSubscribers).toHaveBeenCalledWith('bogus:t1', { type: 'TablePatch' });
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'bogus:t1', reason: 'unknown_prefix' }),
      'Failed to publish to unknown channel',
    );
  });

  it('logs broadcast errors when delivery fails', async () => {
    const { createBroadcastService } = await import('../../../src/services/broadcastService');

    const deliverToSubscribers = vi.fn().mockRejectedValue(new Error('redis down'));
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const logger = { warn: vi.fn(), error: vi.fn() };

    const service = createBroadcastService({ deliverToSubscribers, publisher, logger });

    await service.broadcastToChannel('table:t1', { type: 'TablePatch' });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'table:t1' }),
      'Failed to broadcast to channel',
    );
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('no-ops when sending to user without implementation', async () => {
    const { createBroadcastService } = await import('../../../src/services/broadcastService');

    const deliverToSubscribers = vi.fn().mockResolvedValue(undefined);
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };
    const logger = { warn: vi.fn(), error: vi.fn() };

    const service = createBroadcastService({ deliverToSubscribers, publisher, logger });

    await expect(service.sendToUser('user-1', { type: 'Ping' })).resolves.toBeUndefined();
  });
});

describe('createRedisBroadcastPublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('adapts table/chat/lobby events to pubsub publish methods', async () => {
    const { createRedisBroadcastPublisher } = await import('../../../src/services/broadcastService');

    const publishTableEvent = vi.fn().mockResolvedValue(true);
    const publishChatEvent = vi.fn().mockResolvedValue(true);
    const publishLobbyEvent = vi.fn().mockResolvedValue(true);
    const publisher = createRedisBroadcastPublisher({
      publishTableEvent,
      publishChatEvent,
      publishLobbyEvent,
    } as unknown as Parameters<typeof createRedisBroadcastPublisher>[0]);

    await publisher.publish({ kind: 'table', tableId: 't1' }, { type: 'TablePatch' });
    expect(publishTableEvent).toHaveBeenCalledWith('t1', { type: 'TablePatch' });

    await publisher.publish({ kind: 'chat', tableId: 't2' }, { type: 'ChatMessage' });
    expect(publishChatEvent).toHaveBeenCalledWith('t2', { type: 'ChatMessage' });

    await publisher.publish({ kind: 'lobby' }, { type: 'LobbyTablesUpdated', tables: [{ table_id: 't3' }] });
    expect(publishLobbyEvent).toHaveBeenCalledWith([{ table_id: 't3' }]);
  });

  it('no-ops on lobby publish when tables payload is invalid', async () => {
    const { createRedisBroadcastPublisher } = await import('../../../src/services/broadcastService');

    const publishTableEvent = vi.fn().mockResolvedValue(true);
    const publishChatEvent = vi.fn().mockResolvedValue(true);
    const publishLobbyEvent = vi.fn().mockResolvedValue(true);
    const publisher = createRedisBroadcastPublisher({
      publishTableEvent,
      publishChatEvent,
      publishLobbyEvent,
    } as unknown as Parameters<typeof createRedisBroadcastPublisher>[0]);

    await publisher.publish({ kind: 'lobby' }, { type: 'LobbyTablesUpdated', tables: 'nope' });
    expect(publishLobbyEvent).not.toHaveBeenCalled();
  });
});
