import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, Router } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';

type ProxyEventHandler = (...args: unknown[]) => void;

const proxyState = vi.hoisted(() => {
  const handlers: Record<string, ProxyEventHandler> = {};
  const proxyWeb = vi.fn();
  const proxyServer = {
    on: vi.fn((event: string, handler: ProxyEventHandler) => {
      handlers[event] = handler;
    }),
    web: proxyWeb,
  };

  return { handlers, proxyWeb, proxyServer };
});

vi.mock('http-proxy', () => ({
  default: {
    createProxyServer: vi.fn(() => proxyState.proxyServer),
  },
}));

vi.mock('../../../src/config', () => ({
  getConfig: () => ({
    balanceServiceHttpUrl: 'balance:3002',
  }),
}));

vi.mock('../../../src/observability/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

import { setupProxy } from '../../../src/http/proxy';

describe('HTTP proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards balance routes to configured target', () => {
    type RouteHandler = (req: Request, res: Response) => void;
    const routes: Array<{ path: string; handler: RouteHandler }> = [];
    const app = {
      all: (path: string, handler: RouteHandler) => {
        routes.push({ path, handler });
      },
    } as unknown as Router;

    setupProxy(app);

    const handler = routes.find((route) => route.path === '/api/accounts*');
    expect(handler).toBeDefined();

    const req = {} as Request;
    const res = {} as Response;
    handler?.handler(req, res);

    expect(proxyState.proxyWeb).toHaveBeenCalledWith(
      req,
      res,
      expect.objectContaining({ target: 'http://balance:3002', changeOrigin: true }),
    );
  });

  it('injects auth headers on proxy requests', () => {
    const proxyReq = { setHeader: vi.fn() };
    const req = { auth: { userId: 'user-1', claims: { role: 'player' } } } as Request;

    proxyState.handlers.proxyReq(proxyReq, req);

    expect(proxyReq.setHeader).toHaveBeenCalledWith('x-user-id', 'user-1');
    expect(proxyReq.setHeader).toHaveBeenCalledWith('x-gateway-user-id', 'user-1');
    expect(proxyReq.setHeader).toHaveBeenCalledWith(
      'x-user-claims',
      JSON.stringify({ role: 'player' }),
    );
  });

  it('returns 502 on proxy errors', () => {
    const req = new IncomingMessage(new Socket()) as Request;
    req.url = '/api/accounts';
    const res = new ServerResponse(req);
    vi.spyOn(res, 'writeHead');
    vi.spyOn(res, 'end');

    proxyState.handlers.error(new Error('proxy'), req, res);

    expect(res.writeHead).toHaveBeenCalledWith(502, { 'Content-Type': 'application/json' });
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Proxy error' }));
  });
});
