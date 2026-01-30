import type { Request, Response, Router } from 'express';
import httpProxy from 'http-proxy';
import { ServerResponse } from 'http';
import { getConfig } from '../config';
import logger from '../observability/logger';
import { toHttpUrl } from '../utils/httpUrl';

type Logger = Pick<typeof logger, 'error'>;

type AuthContext = { userId: string; claims: Record<string, unknown> };

type ServiceProxy = {
  forward(req: Request, res: Response): void;
};

function readAuthContext(req: unknown): AuthContext | null {
  const auth = (req as Request).auth;
  if (!auth || typeof auth.userId !== 'string') {
    return null;
  }
  return { userId: auth.userId, claims: auth.claims ?? {} };
}

function getForwardedJsonBody(req: Request): string | null {
  const method = (req.method ?? 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null;
  }

  const body = req.body as unknown;
  if (!body) {
    return null;
  }

  const contentType = String(req.headers['content-type'] ?? '');
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return null;
  }
}

function createAuthenticatedServiceProxy(options: { target: string; logger?: Logger }): ServiceProxy {
  const log = options.logger ?? logger;
  const proxy = httpProxy.createProxyServer({});
  const targetUrl = toHttpUrl(options.target);

  proxy.on('error', (err, req, res) => {
    log.error({ err, url: req.url }, 'Proxy error');
    if (res instanceof ServerResponse && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error' }));
    }
  });

  proxy.on('proxyReq', (proxyReq, req) => {
    const auth = readAuthContext(req);
    if (!auth) {
      return;
    }

    proxyReq.setHeader('x-user-id', auth.userId);
    proxyReq.setHeader('x-gateway-user-id', auth.userId);
    proxyReq.setHeader('x-user-claims', JSON.stringify(auth.claims));

    // Express body parsing consumes the request stream, which would otherwise
    // leave the proxied request with a Content-Length but no body. Re-send the
    // parsed JSON body when present.
    const expressReq = req as Request;
    const bodyData = getForwardedJsonBody(expressReq);
    if (!bodyData) {
      return;
    }

    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  });

  return {
    forward: (req, res) => {
      proxy.web(req, res, { target: targetUrl, changeOrigin: true });
    },
  };
}

export function setupProxy(app: Router) {
  const config = getConfig();

  // Only proxy to services that expose HTTP endpoints
  // Balance Service has HTTP API at its configured port
  // Game, Player, Event services are gRPC-only and handled by /http/routes/*

  const balanceProxy = createAuthenticatedServiceProxy({ target: config.balanceServiceHttpUrl });
  app.all('/api/accounts*', (req: Request, res: Response) => {
    balanceProxy.forward(req, res);
  });
}
