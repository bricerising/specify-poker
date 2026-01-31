export function buyInIdempotencyKeyPrefix(tableId: string, seatId: number, userId: string): string {
  return `buyin:${tableId}:${seatId}:${userId}`;
}
