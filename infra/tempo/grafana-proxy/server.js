const http = require("node:http");
const { URL } = require("node:url");

const upstream = new URL(process.env.TEMPO_URL ?? "http://tempo:3200");
const listenPort = Number.parseInt(process.env.PORT ?? "3200", 10);

function normalizeEpochToSeconds(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  if (value >= 1e18) return String(Math.floor(value / 1e9)); // ns -> s
  if (value >= 1e15) return String(Math.floor(value / 1e6)); // us -> s
  if (value >= 1e12) return String(Math.floor(value / 1e3)); // ms -> s
  return raw; // s
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");

  if (requestUrl.pathname.startsWith("/api/search")) {
    for (const key of ["start", "end"]) {
      const raw = requestUrl.searchParams.get(key);
      if (!raw) continue;

      const normalized = normalizeEpochToSeconds(raw);
      if (normalized !== raw) requestUrl.searchParams.set(key, normalized);
    }
  }

  const upstreamPath = `${requestUrl.pathname}${requestUrl.search}`;
  const headers = { ...req.headers, host: upstream.host, "x-tempo-proxy": "ms-to-s" };

  const proxyReq = http.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || 80,
      method: req.method,
      path: upstreamPath,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    res.statusCode = 502;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(`tempo proxy error: ${err.message}`);
  });

  req.pipe(proxyReq);
});

server.listen(listenPort, () => {
  // eslint-disable-next-line no-console
  console.log(`tempo grafana proxy listening on :${listenPort} -> ${upstream.origin}`);
});

