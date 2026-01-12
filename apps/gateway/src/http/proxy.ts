import { Express, Request, Response } from "express";
import httpProxy from "http-proxy";
import { getConfig } from "../config";
import logger from "../observability/logger";

const proxy = httpProxy.createProxyServer({});

proxy.on("error", (err, req, res) => {
  logger.error({ err, url: req.url }, "Proxy error");
  if (res instanceof Response) {
    res.status(502).json({ error: "Proxy error" });
  }
});

proxy.on("proxyReq", (proxyReq, req) => {
  const auth = (req as Request).auth;
  if (!auth) {
    return;
  }

  proxyReq.setHeader("x-user-id", auth.userId);
  proxyReq.setHeader("x-gateway-user-id", auth.userId);
  proxyReq.setHeader("x-user-claims", JSON.stringify(auth.claims));
});

export function setupProxy(app: Express) {
  const config = getConfig();

  // Helper to strip prefix
  const forward = (prefix: string, target: string) => {
    app.all(`${prefix}*`, (req: Request, res: Response) => {
      const targetUrl = target.startsWith('http') ? target : `http://${target}`;
      proxy.web(req, res, {
        target: targetUrl,
        changeOrigin: true,
      });
    });
  };

  // Based on the spec:
  // /api/tables/* -> Game Service
  // /api/audit/* -> Event Service
  // /api/profile, /api/me, /api/friends -> Player Service
  // /api/accounts/* -> Balance Service

  forward("/api/tables", config.gameServiceUrl);
  forward("/api/audit", config.eventServiceUrl);
  forward("/api/profile", config.playerServiceUrl);
  forward("/api/me", config.playerServiceUrl);
  forward("/api/friends", config.playerServiceUrl);
  forward("/api/accounts", config.balanceServiceUrl);
}
