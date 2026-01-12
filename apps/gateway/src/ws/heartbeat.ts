import WebSocket from "ws";
import logger from "../observability/logger";

export function setupHeartbeat(ws: WebSocket, onDead: () => void) {
  let isAlive = true;

  ws.on("pong", () => {
    isAlive = true;
  });

  const interval = setInterval(() => {
    if (!isAlive) {
      ws.terminate();
      clearInterval(interval);
      onDead();
      return;
    }
    isAlive = false;
    ws.ping();
  }, 30000);

  ws.on("close", () => {
    clearInterval(interval);
  });

  ws.on("error", () => {
    clearInterval(interval);
  });
}
