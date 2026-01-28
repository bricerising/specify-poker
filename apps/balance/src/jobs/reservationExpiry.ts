import { createPeriodicTask, type PeriodicTask } from "@specify-poker/shared";

import { processExpiredReservations } from "../services/reservationService";
import { getConfig } from "../config";
import logger from "../observability/logger";

let task: PeriodicTask | null = null;

export function startReservationExpiryJob(): void {
  const config = getConfig();
  const intervalMs = config.reservationExpiryIntervalMs;

  logger.info({ intervalMs }, "Starting reservation expiry job");

  task?.stop();
  task = createPeriodicTask({
    name: "balance.reservation_expiry",
    intervalMs,
    logger,
    run: async () => {
      try {
        const expiredCount = await processExpiredReservations();
        if (expiredCount > 0) {
          logger.info({ expiredCount }, "Expired reservations");
        }
      } catch (error) {
        logger.error({ err: error }, "Reservation expiry job error");
      }
    },
  });
  task.start();
}

export function stopReservationExpiryJob(): void {
  task?.stop();
  task = null;
}
