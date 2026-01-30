import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type WebSocket from 'ws';

import { attachWsMultiplexRouter } from '../../../src/ws/router';

vi.mock('../../../src/observability/logger', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import logger from '../../../src/observability/logger';

class MockSocket extends EventEmitter {}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

type TestMessage =
  | { type: 'Ping'; value: string }
  | { type: 'Chat'; value: string }
  | { type: 'Unknown'; value: string };

function parseTestMessage(data: WebSocket.RawData): TestMessage | null {
  const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as TestMessage;
}

describe('attachWsMultiplexRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches to the correct hub handler and parses once', async () => {
    const socket = new MockSocket();
    const parseMessage = vi.fn(parseTestMessage);
    const onPing = vi.fn();
    const onChat = vi.fn();

    attachWsMultiplexRouter<TestMessage>(socket as unknown as WebSocket, {
      parseMessage,
      hubs: [
        { hubName: 'table', handlers: { Ping: onPing } },
        { hubName: 'chat', handlers: { Chat: onChat } },
      ],
    });

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'Ping', value: 'hello' })));
    await flushPromises();

    expect(parseMessage).toHaveBeenCalledTimes(1);
    expect(onPing).toHaveBeenCalledWith({ type: 'Ping', value: 'hello' });
    expect(onChat).not.toHaveBeenCalled();
  });

  it('logs and continues when getAttributes throws for a hub', async () => {
    const socket = new MockSocket();
    const onChat = vi.fn();
    const getAttributes = vi.fn(() => {
      throw new Error('boom');
    });

    attachWsMultiplexRouter<TestMessage>(socket as unknown as WebSocket, {
      parseMessage: parseTestMessage,
      hubs: [{ hubName: 'chat', handlers: { Chat: onChat }, getAttributes }],
    });

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'Chat', value: 'hi' })));
    await flushPromises();

    expect(onChat).toHaveBeenCalledWith({ type: 'Chat', value: 'hi' });
    expect(getAttributes).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Chat', err: expect.any(Error) }),
      'ws.chat.attributes.failed',
    );
  });

  it('logs handler exceptions as ws.{hub}.failed (not ws.multiplex.unhandled)', async () => {
    const socket = new MockSocket();
    const onPing = vi.fn(() => {
      throw new Error('boom');
    });

    attachWsMultiplexRouter<TestMessage>(socket as unknown as WebSocket, {
      parseMessage: parseTestMessage,
      hubs: [{ hubName: 'table', handlers: { Ping: onPing } }],
    });

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'Ping', value: 'hello' })));
    await flushPromises();

    expect(onPing).toHaveBeenCalledWith({ type: 'Ping', value: 'hello' });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Ping', err: expect.any(Error) }),
      'ws.table.failed',
    );

    const hasUnhandled = vi
      .mocked(logger.error)
      .mock.calls.some((call) => call[1] === 'ws.multiplex.unhandled');
    expect(hasUnhandled).toBe(false);
  });

  it('logs parse exceptions and does not dispatch', async () => {
    const socket = new MockSocket();
    const onPing = vi.fn();
    const parseMessage = vi.fn(() => {
      throw new Error('bad_json');
    });

    attachWsMultiplexRouter<TestMessage>(socket as unknown as WebSocket, {
      parseMessage,
      hubs: [{ hubName: 'table', handlers: { Ping: onPing } }],
    });

    socket.emit('message', Buffer.from('{'));
    await flushPromises();

    expect(onPing).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'ws.multiplex.parse.failed',
    );
  });

  it('runs hub and router close hooks', async () => {
    const socket = new MockSocket();
    const onHubClose = vi.fn(async () => {});
    const onRouterClose = vi.fn(async () => {});

    attachWsMultiplexRouter<TestMessage>(socket as unknown as WebSocket, {
      parseMessage: parseTestMessage,
      hubs: [{ hubName: 'table', handlers: {}, onClose: onHubClose }],
      onClose: onRouterClose,
    });

    socket.emit('close');
    await flushPromises();

    expect(onHubClose).toHaveBeenCalledTimes(1);
    expect(onRouterClose).toHaveBeenCalledTimes(1);
  });
});

