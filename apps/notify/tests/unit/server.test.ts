import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/observability', () => ({
  startObservability: vi.fn(),
}));

vi.mock("../../src/api/grpc/server", () => ({
  startGrpcServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/services/eventConsumer", () => {
  return {
    EventConsumer: vi.fn().mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock("../../src/storage/subscriptionStore", () => {
  return {
    SubscriptionStore: vi.fn(),
  };
});

vi.mock("../../src/services/pushSenderService", () => {
  return {
    PushSenderService: vi.fn(),
  };
});

vi.mock("../../src/services/subscriptionService", () => {
  return {
    SubscriptionService: vi.fn(),
  };
});

vi.mock("../../src/observability/metrics", () => ({
  startMetricsServer: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

import { main } from "../../src/server";
import { startGrpcServer } from "../../src/api/grpc/server";

describe('Server main', () => {
  it('should initialize and start services', async () => {
    await main();
    expect(startGrpcServer).toHaveBeenCalled();
  });

  it('should throw error if start fails', async () => {
    (startGrpcServer as unknown).mockRejectedValueOnce(new Error('Start failed'));
    await expect(main()).rejects.toThrow('Start failed');
  });
});
