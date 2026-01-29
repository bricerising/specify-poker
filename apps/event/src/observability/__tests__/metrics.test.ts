import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  counterInstances,
  histogramInstances,
  metricsMock,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
  createServer,
  loggerInfo,
  getRequestHandler,
  resetRequestHandler,
} = vi.hoisted(() => {
  const counterInstances: { inc: ReturnType<typeof vi.fn> }[] = [];
  const histogramInstances: { observe: ReturnType<typeof vi.fn> }[] = [];
  const metricsMock = vi.fn().mockResolvedValue('metrics');
  const collectDefaultMetrics = vi.fn();

  const Counter = vi.fn(() => {
    const instance = { inc: vi.fn() };
    counterInstances.push(instance);
    return instance;
  });

  const Histogram = vi.fn(() => {
    const instance = { observe: vi.fn() };
    histogramInstances.push(instance);
    return instance;
  });

  class Registry {
    contentType = 'text/plain';
    metrics = metricsMock;
  }

  let requestHandler:
    | ((req: { url?: string }, res: Record<string, unknown>) => Promise<void>)
    | null = null;

  const createServer = vi.fn((handler) => {
    requestHandler = handler;
    return {
      listen: vi.fn((_: number, callback?: () => void) => {
        if (callback) callback();
      }),
    };
  });

  return {
    counterInstances,
    histogramInstances,
    metricsMock,
    collectDefaultMetrics,
    Counter,
    Histogram,
    Registry,
    createServer,
    loggerInfo: vi.fn(),
    getRequestHandler: () => requestHandler,
    resetRequestHandler: () => {
      requestHandler = null;
    },
  };
});

vi.mock('prom-client', () => ({
  default: {
    collectDefaultMetrics,
  },
  Counter,
  Histogram,
  Registry,
}));

vi.mock('http', () => ({
  default: {
    createServer,
  },
  createServer,
}));

vi.mock('../logger', () => ({
  default: {
    info: loggerInfo,
  },
}));

import {
  recordIngestion,
  recordGrpcRequest,
  recordQueryDuration,
  recordMaterializationLag,
  renderMetrics,
  startMetricsServer,
} from '../metrics';

describe('metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRequestHandler();
  });

  it('records ingestion counters', () => {
    recordIngestion('HAND_STARTED');

    expect(counterInstances[0].inc).toHaveBeenCalledWith({ type: 'HAND_STARTED' });
  });

  it('records query duration in seconds', () => {
    recordQueryDuration('ok', 1200);

    expect(histogramInstances[0].observe).toHaveBeenCalledWith({ status: 'ok' }, 1.2);
  });

  it('records gRPC request duration in seconds', () => {
    recordGrpcRequest('PublishEvent', 'ok', 250);

    expect(histogramInstances[1].observe).toHaveBeenCalledWith({ method: 'PublishEvent', status: 'ok' }, 0.25);
  });

  it('records materialization lag in seconds', () => {
    recordMaterializationLag(5000);

    expect(histogramInstances[2].observe).toHaveBeenCalledWith(5);
  });

  it('renders metrics from the registry', async () => {
    await expect(renderMetrics()).resolves.toBe('metrics');
    expect(metricsMock).toHaveBeenCalledTimes(1);
  });

  it('serves metrics and 404 responses', async () => {
    startMetricsServer(9100);

    const handler = getRequestHandler();
    const okResponse = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    await handler?.({ url: '/metrics' }, okResponse);

    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(okResponse.end).toHaveBeenCalledWith('metrics');
    expect(loggerInfo).toHaveBeenCalledWith({ port: 9100 }, 'Event metrics server listening');

    const notFoundResponse = {
      statusCode: 0,
      end: vi.fn(),
    };
    await handler?.({ url: '/nope' }, notFoundResponse);

    expect(notFoundResponse.statusCode).toBe(404);
    expect(notFoundResponse.end).toHaveBeenCalledWith('Not Found');
  });
});
