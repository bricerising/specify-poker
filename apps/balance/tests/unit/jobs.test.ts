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
    (config.getConfig as any).mockReturnValue({
      reservationExpiryIntervalMs: 100,
      ledgerVerificationIntervalMs: 100,
    });
    (accountStore.listAccounts as any).mockResolvedValue([{ accountId: 'a1' }]);
    (ledgerService.verifyAllLedgers as any).mockResolvedValue({ valid: true, results: {} });
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
