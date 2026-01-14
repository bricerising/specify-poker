import type { Request, Response, Router } from "express";
import httpProxy from "http-proxy";
import { ServerResponse } from "http";
import { getConfig } from "../config";
import logger from "../observability/logger";

const proxy = httpProxy.createProxyServer({});

proxy.on("error", (err, req, res) => {
  logger.error({ err, url: req.url }, "Proxy error");
  if (res instanceof ServerResponse && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Proxy error" }));
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

  // Express body parsing consumes the request stream, which would otherwise
  // leave the proxied request with a Content-Length but no body. Re-send the
  // parsed JSON body when present.
  const method = (req.method ?? "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return;
  }

  const expressReq = req as Request;
  const body = expressReq.body as unknown;
  if (!body) {
    return;
  }

  const contentType = String(expressReq.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("application/json")) {
    return;
  }

  const bodyData = typeof body === "string" ? body : JSON.stringify(body);
  proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
  proxyReq.write(bodyData);
});

export function setupProxy(app: Router) {
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

  // Only proxy to services that expose HTTP endpoints
  // Balance Service has HTTP API at its configured port
  // Game, Player, Event services are gRPC-only and handled by /http/routes/*

  forward("/api/accounts", config.balanceServiceHttpUrl);
}
