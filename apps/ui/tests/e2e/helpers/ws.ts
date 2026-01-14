import WebSocket from "ws";

export type WsClient = {
  socket: WebSocket;
  messages: Array<Record<string, unknown>>;
  close: () => Promise<{ code?: number; reason?: string }>;
  send: (message: Record<string, unknown>) => void;
  waitForMessage: (predicate: (message: Record<string, unknown>) => boolean, timeoutMs?: number) => Promise<Record<string, unknown>>;
};

export async function connectWs(
  url: string,
  options: { headers?: Record<string, string> } = {},
): Promise<WsClient> {
  const socket = new WebSocket(url, { headers: options.headers });
  const messages: Array<Record<string, unknown>> = [];
  let closeMeta: { code?: number; reason?: string } | null = null;

  socket.on("message", (data) => {
    try {
      const parsed: unknown = JSON.parse(data.toString());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        messages.push(parsed as Record<string, unknown>);
      }
    } catch {
      // ignore non-JSON messages
    }
  });

  socket.on("close", (code, reason) => {
    closeMeta = { code, reason: reason.toString() };
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`WS open timeout: ${url}`)), 5000);
    socket.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const waitForMessage: WsClient["waitForMessage"] = async (predicate, timeoutMs = 5000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const found = messages.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for WS message after ${timeoutMs}ms`);
  };

  return {
    socket,
    messages,
    send(message) {
      socket.send(JSON.stringify(message));
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) {
        return closeMeta ?? {};
      }
      socket.close();
      await new Promise<void>((resolve) => {
        socket.once("close", () => resolve());
      });
      return closeMeta ?? {};
    },
    waitForMessage,
  };
}

