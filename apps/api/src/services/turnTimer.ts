const timers = new Map<string, NodeJS.Timeout>();

export function clearTurnTimeout(tableId: string) {
  const existing = timers.get(tableId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(tableId);
  }
}

export function scheduleTurnTimeout(options: {
  tableId: string;
  durationMs: number;
  onTimeout: () => void;
}) {
  clearTurnTimeout(options.tableId);
  const deadline = new Date(Date.now() + options.durationMs);
  const timeout = setTimeout(() => {
    timers.delete(options.tableId);
    options.onTimeout();
  }, options.durationMs);
  timers.set(options.tableId, timeout);
  return deadline;
}
