import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type WebSocket from 'ws';

import { attachWsRouter } from '../../../src/ws/router';

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
  | { type: 'Crash'; value: string }
  | { type: 'Unknown'; value: string };

function parseTestMessage(data: WebSocket.RawData): TestMessage | null {
  const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as TestMessage;
}

describe('attachWsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes parsed messages to matching handlers', async () => {
    const socket = new MockSocket();
    const onPing = vi.fn();

    attachWsRouter<TestMessage>(socket as unknown as WebSocket, {
      hubName: 'test',
      parseMessage: parseTestMessage,
      handlers: {
        Ping: onPing,
      },
    });

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'Ping', value: 'hello' })));
    await flushPromises();

    expect(onPing).toHaveBeenCalledWith({ type: 'Ping', value: 'hello' });
  });

  it('logs and continues when getAttributes throws', async () => {
    const socket = new MockSocket();
    const onPing = vi.fn();
    const getAttributes = vi.fn(() => {
      throw new Error('boom');
    });

    attachWsRouter<TestMessage>(socket as unknown as WebSocket, {
      hubName: 'test',
      parseMessage: parseTestMessage,
      getAttributes,
      handlers: {
        Ping: onPing,
      },
    });

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'Ping', value: 'hello' })));
    await flushPromises();

    expect(onPing).toHaveBeenCalledWith({ type: 'Ping', value: 'hello' });
    expect(getAttributes).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Ping', err: expect.any(Error) }),
      'ws.test.attributes.failed',
    );
  });

  it('logs handler exceptions as ws.{hub}.failed (not ws.{hub}.unhandled)', async () => {
    const socket = new MockSocket();
    const onCrash = vi.fn(() => {
      throw new Error('boom');
    });

    attachWsRouter<TestMessage>(socket as unknown as WebSocket, {
      hubName: 'test',
      parseMessage: parseTestMessage,
      handlers: {
        Crash: onCrash,
      },
    });

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'Crash', value: 'hello' })));
    await flushPromises();

    expect(onCrash).toHaveBeenCalledWith({ type: 'Crash', value: 'hello' });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Crash', err: expect.any(Error) }),
      'ws.test.failed',
    );

    const hasUnhandled = vi
      .mocked(logger.error)
      .mock.calls.some((call) => call[1] === 'ws.test.unhandled');
    expect(hasUnhandled).toBe(false);
  });

  it('does not re-dispatch when handler throws and getAttributes is provided', async () => {
    const socket = new MockSocket();
    const onCrash = vi.fn(() => {
      throw new Error('boom');
    });
    const getAttributes = vi.fn(() => ({ 'x-test': 'true' }));

    attachWsRouter<TestMessage>(socket as unknown as WebSocket, {
      hubName: 'test',
      parseMessage: parseTestMessage,
      getAttributes,
      handlers: {
        Crash: onCrash,
      },
    });

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'Crash', value: 'hello' })));
    await flushPromises();

    expect(getAttributes).toHaveBeenCalledTimes(1);
    expect(onCrash).toHaveBeenCalledTimes(1);

    const hasAttributesFailed = vi
      .mocked(logger.warn)
      .mock.calls.some((call) => call[1] === 'ws.test.attributes.failed');
    expect(hasAttributesFailed).toBe(false);
  });

  it('logs parse exceptions and does not dispatch', async () => {
    const socket = new MockSocket();
    const onPing = vi.fn();
    const parseMessage = vi.fn(() => {
      throw new Error('bad_json');
    });

    attachWsRouter<TestMessage>(socket as unknown as WebSocket, {
      hubName: 'test',
      parseMessage,
      handlers: {
        Ping: onPing,
      },
    });

    socket.emit('message', Buffer.from('{'));
    await flushPromises();

    expect(onPing).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'ws.test.parse.failed',
    );
  });

  it('ignores messages that parse to null', async () => {
    const socket = new MockSocket();
    const onPing = vi.fn();

    attachWsRouter<TestMessage>(socket as unknown as WebSocket, {
      hubName: 'test',
      parseMessage: () => null,
      handlers: {
        Ping: onPing,
      },
    });

    socket.emit('message', Buffer.from(JSON.stringify({ type: 'Ping', value: 'hello' })));
    await flushPromises();

    expect(onPing).not.toHaveBeenCalled();
  });
});
