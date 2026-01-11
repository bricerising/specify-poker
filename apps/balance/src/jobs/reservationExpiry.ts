import { processExpiredReservations } from "../services/reservationService";
import { getConfig } from "../config";

let intervalId: NodeJS.Timeout | null = null;

export function startReservationExpiryJob(): void {
  const config = getConfig();
  const intervalMs = config.reservationExpiryIntervalMs;

  console.log(`Starting reservation expiry job (interval: ${intervalMs}ms)`);

  intervalId = setInterval(async () => {
    try {
      const expiredCount = await processExpiredReservations();
      if (expiredCount > 0) {
        console.log(`Expired ${expiredCount} reservations`);
      }
    } catch (error) {
      console.error("Reservation expiry job error:", error);
    }
  }, intervalMs);
}

export function stopReservationExpiryJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
