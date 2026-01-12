import { processExpiredReservations } from "../services/reservationService";
import { getConfig } from "../config";
import logger from "../observability/logger";

let intervalId: NodeJS.Timeout | null = null;

export function startReservationExpiryJob(): void {
  const config = getConfig();
  const intervalMs = config.reservationExpiryIntervalMs;

  logger.info({ intervalMs }, "Starting reservation expiry job");

  intervalId = setInterval(async () => {
    try {
      const expiredCount = await processExpiredReservations();
      if (expiredCount > 0) {
        logger.info({ expiredCount }, "Expired reservations");
      }
    } catch (error) {
      logger.error({ err: error }, "Reservation expiry job error");
    }
  }, intervalMs);
}

export function stopReservationExpiryJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
