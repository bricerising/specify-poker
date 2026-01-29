import { describe, expect, it, vi } from 'vitest';

import {
  dispatchByType,
  dispatchByTypeNoCtx,
  type DispatchByTypeHandlerMap,
  type DispatchByTypeNoCtxHandlerMap,
} from '../src';

describe('dispatchByType', () => {
  it('dispatches to the handler for event.type and returns its value', () => {
    type Ctx = { requestId: string };
    type Event = { type: 'A'; value: number } | { type: 'B'; text: string };

    const handlers: DispatchByTypeHandlerMap<Ctx, Event, string> = {
      A: vi.fn((_ctx, event) => `A:${event.value}`),
      B: vi.fn((_ctx, event) => `B:${event.text}`),
    };

    const ctx: Ctx = { requestId: 'req-1' };

    expect(dispatchByType(handlers, ctx, { type: 'A', value: 1 })).toBe('A:1');
    expect(dispatchByType(handlers, ctx, { type: 'B', text: 'hi' })).toBe('B:hi');

    expect(handlers.A).toHaveBeenCalledTimes(1);
    expect(handlers.B).toHaveBeenCalledTimes(1);
  });
});

describe('dispatchByTypeNoCtx', () => {
  it('dispatches to the handler for event.type and returns its value', () => {
    type Event = { type: 'A'; value: number } | { type: 'B'; text: string };

    const handlers: DispatchByTypeNoCtxHandlerMap<Event, string> = {
      A: vi.fn((event) => `A:${event.value}`),
      B: vi.fn((event) => `B:${event.text}`),
    };

    expect(dispatchByTypeNoCtx(handlers, { type: 'A', value: 1 })).toBe('A:1');
    expect(dispatchByTypeNoCtx(handlers, { type: 'B', text: 'hi' })).toBe('B:hi');

    expect(handlers.A).toHaveBeenCalledTimes(1);
    expect(handlers.B).toHaveBeenCalledTimes(1);
  });
});
