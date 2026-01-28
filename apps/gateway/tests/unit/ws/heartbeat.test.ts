import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { setupHeartbeat } from '../../../src/ws/heartbeat';

class MockSocket extends EventEmitter {
  ping = vi.fn();
  terminate = vi.fn();
  readyState = WebSocket.OPEN;
}

describe('WebSocket heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pings and terminates dead connections', () => {
    const socket = new MockSocket();
    const onDead = vi.fn();

    setupHeartbeat(socket as unknown as WebSocket, onDead);

    vi.advanceTimersByTime(30000);
    expect(socket.ping).toHaveBeenCalled();

    vi.advanceTimersByTime(30000);
    expect(socket.terminate).toHaveBeenCalled();
    expect(onDead).toHaveBeenCalled();
  });

  it('resets liveness on pong', () => {
    const socket = new MockSocket();
    const onDead = vi.fn();

    setupHeartbeat(socket as unknown as WebSocket, onDead);

    socket.emit('pong');
    vi.advanceTimersByTime(30000);

    expect(socket.terminate).not.toHaveBeenCalled();
  });
});
