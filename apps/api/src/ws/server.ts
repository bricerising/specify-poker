import { randomUUID } from "crypto";
import http from "http";
import { WebSocketServer } from "ws";

import { verifyToken } from "../auth/jwt";
import { getTracer } from "../observability/otel";
import { registerConnection, unregisterConnection } from "./connectionRegistry";

export function attachWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket, request) => {
    const requestUrl = request.url ?? "";
    const url = new URL(requestUrl, `http://${request.headers.host ?? "localhost"}`);
    const token = url.searchParams.get("token");

    if (!token) {
      socket.close(1008, "Missing token");
      return;
    }

    let claims;
    try {
      claims = verifyToken(token);
    } catch (error) {
      socket.close(1008, "Invalid token");
      return;
    }

    const userId = claims.sub ?? "unknown";
    const connectionId = randomUUID();

    registerConnection({
      connectionId,
      userId,
      connectedAt: new Date().toISOString(),
    });

    const span = getTracer().startSpan("api.ws.connect", {
      attributes: {
        "poker.user_id": userId,
        "poker.connection_id": connectionId,
      },
    });

    socket.send(
      JSON.stringify({
        type: "Welcome",
        userId,
        connectionId,
      }),
    );
    span.end();

    socket.on("close", () => {
      unregisterConnection(connectionId);
    });
  });

  return wss;
}
