import http from 'http';

export type PrometheusRegistryLike = {
  contentType: string;
  metrics(): string | Promise<string>;
};

export type MetricsServerLogger = {
  info?: (obj: Record<string, unknown>, msg: string) => void;
  error?: (obj: Record<string, unknown>, msg: string) => void;
};

export type StartPrometheusMetricsServerOptions = {
  port: number;
  registry: PrometheusRegistryLike;
  logger?: MetricsServerLogger;
  logMessage?: string;
  path?: string;
};

function getPathname(url: unknown): string | null {
  if (typeof url !== 'string') {
    return null;
  }
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return null;
  }
}

/**
 * A small facade around serving Prometheus metrics over HTTP:
 * - serves `/metrics` (configurable)
 * - sets the correct `Content-Type` based on the registry
 * - handles async errors without unhandled rejections
 */
export function startPrometheusMetricsServer(
  options: StartPrometheusMetricsServerOptions,
): http.Server {
  const path = options.path ?? '/metrics';

  const server = http.createServer(async (req, res) => {
    if (getPathname(req.url) !== path) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    try {
      const body = await Promise.resolve(options.registry.metrics());
      res.statusCode = 200;
      res.setHeader('Content-Type', options.registry.contentType);
      res.end(body);
    } catch (err: unknown) {
      options.logger?.error?.({ err }, 'Failed to render metrics');
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  server.listen(options.port, () => {
    options.logger?.info?.(
      { port: options.port },
      options.logMessage ?? 'Metrics server listening',
    );
  });

  return server;
}
