import { describe, expect, it, vi } from 'vitest';

const httpState = vi.hoisted(() => ({
  handler: null as
    | ((
        req: { url?: string },
        res: {
          statusCode: number;
          setHeader: (k: string, v: string) => void;
          end: (body?: string) => void;
        },
      ) => void)
    | null,
  lastBody: '',
  lastStatus: 0,
  lastHeaders: {} as Record<string, string>,
}));

vi.mock('http', () => ({
  createServer: (handler: typeof httpState.handler) => {
    httpState.handler = handler;
    return {
      listen: (_port: number, cb?: () => void) => cb?.(),
      close: () => undefined,
    };
  },
  default: {
    createServer: (handler: typeof httpState.handler) => {
      httpState.handler = handler;
      return {
        listen: (_port: number, cb?: () => void) => cb?.(),
        close: () => undefined,
      };
    },
  },
}));

vi.mock('../../src/observability/logger', () => ({
  default: { info: vi.fn() },
}));

describe('metrics', () => {
  it('records metrics and renders output', async () => {
    const metrics = await import('../../src/observability/metrics');

    metrics.recordGrpcRequest('Test', 'ok', 12);
    metrics.recordHandStarted('table-1');
    metrics.recordHandCompleted('table-1', 'showdown');
    metrics.recordAction('CALL');
    metrics.recordTurnTime('PREFLOP', 'CALL', 500);
    metrics.setActiveTables(2);
    metrics.setSeatedPlayers(4);
    metrics.setSpectatorCount(1);

    const output = await metrics.renderMetrics();
    expect(output).toContain('game_grpc_request_duration_seconds');
    expect(output).toContain('game_hands_started_total');
    expect(output).toContain('game_actions_processed_total');
  });

  it('serves the metrics endpoint', async () => {
    const metrics = await import('../../src/observability/metrics');
    metrics.startMetricsServer(9105);

    expect(httpState.handler).toBeTruthy();
    const response = {
      statusCode: 0,
      setHeader: (key: string, value: string) => {
        httpState.lastHeaders[key] = value;
      },
      end: (body?: string) => {
        httpState.lastBody = body ?? '';
      },
    };

    await Promise.resolve(httpState.handler?.({ url: '/metrics' }, response));
    expect(httpState.lastBody).toContain('game_hands_started_total');
  });
});
