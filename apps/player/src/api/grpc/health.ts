export function createHealthHandlers() {
  return {
    check: (_call: unknown, callback: (error: Error | null, response?: unknown) => void) => {
      callback(null, { status: "SERVING" });
    },
    watch: (call: { write: (msg: unknown) => void; end: () => void }) => {
      call.write({ status: "SERVING" });
      call.end();
    },
  };
}
