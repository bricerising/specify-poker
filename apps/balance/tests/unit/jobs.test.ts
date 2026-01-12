import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startReservationExpiryJob, stopReservationExpiryJob } from '../../src/jobs/reservationExpiry';
import { startLedgerVerificationJob, stopLedgerVerificationJob } from '../../src/jobs/ledgerVerification';
import * as reservationService from '../../src/services/reservationService';
import * as ledgerService from '../../src/services/ledgerService';
import * as config from '../../src/config';
import * as accountStore from '../../src/storage/accountStore';

vi.mock('../../src/services/reservationService');
vi.mock('../../src/services/ledgerService');
vi.mock('../../src/config');
vi.mock('../../src/storage/accountStore');

describe('Background Jobs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(config.getConfig).mockReturnValue({
      reservationExpiryIntervalMs: 100,
      ledgerVerificationIntervalMs: 100,
      grpcPort: 50051,
      metricsPort: 9090,
      httpPort: 3002,
      redisUrl: 'redis://localhost:6379',
      reservationTimeoutMs: 30000,
      idempotencyTtlMs: 86400000,
      logLevel: "info",
      otelExporterEndpoint: "http://localhost:4317",
      jwtSecret: "test-secret",
    } as unknown as ReturnType<typeof config.getConfig>);
    vi.mocked(accountStore.listAccounts).mockResolvedValue([{ accountId: 'a1', balance: 100, availableBalance: 100, currency: 'CHIPS', version: 1 }]);
    vi.mocked(ledgerService.verifyAllLedgers).mockResolvedValue({ valid: true, results: {} });
  });

  afterEach(() => {
    stopReservationExpiryJob();
    stopLedgerVerificationJob();
    vi.useRealTimers();
  });

  it('reservationExpiry job should call service', async () => {
    startReservationExpiryJob();
    await vi.advanceTimersByTimeAsync(150);
    expect(reservationService.processExpiredReservations).toHaveBeenCalled();
  });

  it('ledgerVerification job should call service', async () => {
    startLedgerVerificationJob();
    await vi.advanceTimersByTimeAsync(150);
    expect(ledgerService.verifyAllLedgers).toHaveBeenCalled();
  });
});
