import { randomUUID } from "crypto";
import http from "http";
import { WebSocketServer } from "ws";

import { verifyToken } from "../auth/jwt";
import { getTracer } from "../observability/otel";
import { markSeatDisconnected } from "../services/tableService";
import { getConnection, registerConnection, unregisterConnection } from "./connectionRegistry";
import { attachChatHub, handleChatPubSubEvent } from "./chatHub";
import { attachLobbyHub, handleLobbyPubSubEvent, initLobbyHub } from "./lobbyHub";
import { attachTableHub, handleTablePubSubEvent, handleTimerPubSubEvent } from "./tableHub";
import { initWsPubSub } from "./pubsub";

export function attachWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  void initWsPubSub({
    onTableEvent: handleTablePubSubEvent,
    onChatEvent: handleChatPubSubEvent,
    onTimerEvent: handleTimerPubSubEvent,
    onLobbyEvent: handleLobbyPubSubEvent,
  });
  initLobbyHub();

  wss.on("connection", async (socket, request) => {
    const requestUrl = request.url ?? "";
    const url = new URL(requestUrl, `http://${request.headers.host ?? "localhost"}`);
    const token = url.searchParams.get("token");

    if (!token) {
      socket.close(1008, "Missing token");
      return;
    }

    let claims;
    try {
      claims = await verifyToken(token);
    } catch {
      socket.close(1008, "Invalid token");
      return;
    }

    const userId = claims.sub ?? "unknown";
    const connectionId = randomUUID();

    await registerConnection({
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

    attachTableHub(socket, userId, connectionId);
    attachChatHub(socket, userId, connectionId);
    attachLobbyHub(socket, connectionId);

    socket.on("close", () => {
      void getConnection(connectionId).then(async (connection) => {
        const disconnectedUser = connection?.userId ?? userId;
        if (disconnectedUser) {
          await markSeatDisconnected(disconnectedUser);
        }
        const span = getTracer().startSpan("poker.ws.disconnect", {
          attributes: {
            "poker.user_id": disconnectedUser ?? "unknown",
            "poker.connection_id": connectionId,
          },
        });
        span.end();
        await unregisterConnection(connectionId);
      });
    });
  });

  return wss;
}
