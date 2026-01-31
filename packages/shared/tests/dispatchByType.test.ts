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

  it('throws a helpful error when a handler is missing at runtime', () => {
    type Ctx = { requestId: string };
    type Event = { type: 'A'; value: number } | { type: 'B'; text: string };

    const handlers = {
      A: vi.fn((_ctx: Ctx, event: Extract<Event, { type: 'A' }>) => `A:${event.value}`),
    } as unknown as DispatchByTypeHandlerMap<Ctx, Event, string>;

    expect(() =>
      dispatchByType(handlers, { requestId: 'req-1' }, { type: 'B', text: 'hi' } as Event),
    ).toThrowError('dispatchByType.missing_handler:B');
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

  it('throws a helpful error when a handler is missing at runtime', () => {
    type Event = { type: 'A'; value: number } | { type: 'B'; text: string };

    const handlers = {
      A: vi.fn((event: Extract<Event, { type: 'A' }>) => `A:${event.value}`),
    } as unknown as DispatchByTypeNoCtxHandlerMap<Event, string>;

    expect(() => dispatchByTypeNoCtx(handlers, { type: 'B', text: 'hi' } as Event)).toThrowError(
      'dispatchByTypeNoCtx.missing_handler:B',
    );
  });
});
