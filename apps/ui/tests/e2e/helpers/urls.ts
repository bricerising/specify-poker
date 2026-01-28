export const urls = {
  ui: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  gateway: process.env.PLAYWRIGHT_GATEWAY_URL ?? 'http://localhost:4000',
  balance: process.env.PLAYWRIGHT_BALANCE_URL ?? 'http://localhost:3002',
  keycloak: process.env.PLAYWRIGHT_KEYCLOAK_URL ?? 'http://localhost:8080',
  mimir:
    process.env.PLAYWRIGHT_MIMIR_URL ??
    process.env.PLAYWRIGHT_PROMETHEUS_URL ??
    'http://localhost:9009',
  grafana: process.env.PLAYWRIGHT_GRAFANA_URL ?? 'http://localhost:3001',
  loki: process.env.PLAYWRIGHT_LOKI_URL ?? 'http://localhost:3100',
  tempo: process.env.PLAYWRIGHT_TEMPO_URL ?? 'http://localhost:3200',
} as const;

export function gatewayWsUrl(token?: string): string {
  const gatewayUrl = new URL(urls.gateway);
  const protocol = gatewayUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = new URL(`${protocol}//${gatewayUrl.host}/ws`);
  if (token) {
    wsUrl.searchParams.set('token', token);
  }
  return wsUrl.toString();
}
