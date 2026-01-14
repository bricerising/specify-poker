import { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import { context, ROOT_CONTEXT } from "@opentelemetry/api";
import { authenticateWs, authenticateWsToken, WsAuthResult } from "./auth";
import { registerConnection, unregisterConnection } from "./connectionRegistry";
import { initWsPubSub } from "./pubsub";
import { attachTableHub, handleTablePubSubEvent } from "./handlers/table";
import { attachLobbyHub, handleLobbyPubSubEvent } from "./handlers/lobby";
import { attachChatHub, handleChatPubSubEvent } from "./handlers/chat";
import { eventClient } from "../grpc/clients";
import { updatePresence } from "../storage/sessionStore";
import { getConnectionsByUser } from "../storage/connectionStore";
import { setupHeartbeat } from "./heartbeat";
import logger from "../observability/logger";
import { recordWsConnected, recordWsDisconnected } from "../observability/metrics";
import { IncomingMessage } from "http";

interface AuthenticatedRequest extends IncomingMessage {
  wsAuthResult?: WsAuthResult;
}

const sessionMeta = new Map<string, { startedAt: number; clientType: string }>();
const authTimeoutMs = 5000;

function toStruct(obj: Record<string, unknown>) {
  const struct: { fields: Record<string, unknown> } = { fields: {} };
  for (const [key, value] of Object.entries(obj)) {
    struct.fields[key] = toValue(value);
  }
  return struct;
}

function toValue(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { numberValue: value };
  if (typeof value === "boolean") return { boolValue: value };
  if (Array.isArray(value)) {
    return { listValue: { values: value.map((entry) => toValue(entry)) } };
  }
  if (value && typeof value === "object") {
    return { structValue: toStruct(value as Record<string, unknown>) };
  }
  return { nullValue: 0 };
}

function emitSessionEvent(type: string, userId: string, payload: Record<string, unknown>) {
  eventClient.PublishEvent(
    {
      type,
      table_id: "lobby",
      user_id: userId,
      payload: toStruct(payload),
      idempotency_key: randomUUID(),
    },
    (err, response) => {
      if (err || !response?.success) {
        logger.error({ err, type, userId }, "Failed to emit session event");
      }
    },
  );
}

function getClientIp(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress ?? "unknown";
}

function getClientType(request: IncomingMessage) {
  const ua = request.headers["user-agent"] ?? "";
  if (typeof ua === "string" && ua.toLowerCase().includes("mobile")) {
    return "mobile";
  }
  return "web";
}

function closeWithAuthError(ws: WebSocket, reason: string) {
  ws.close(1008, reason);
}

export async function initWsServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  await initWsPubSub({
    onTableEvent: handleTablePubSubEvent,
    onChatEvent: handleChatPubSubEvent,
    onTimerEvent: handleTablePubSubEvent,
    onLobbyEvent: handleLobbyPubSubEvent,
  });

  server.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const authResult = await authenticateWs(request);
    (request as AuthenticatedRequest).wsAuthResult = authResult;

    context.with(ROOT_CONTEXT, () => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
  });

  wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
    const authResult = (request as AuthenticatedRequest).wsAuthResult;
    if (!authResult) {
      ws.close(1011, "Authentication unavailable");
      return;
    }

    if (authResult.status === "invalid") {
      closeWithAuthError(ws, "Unauthorized");
      return;
    }

    const finalizeConnection = async (userId: string) => {
      const connectionId = randomUUID();
      const connectedAt = new Date().toISOString();
      const ip = getClientIp(request);
      const clientType = getClientType(request);

      logger.info({ userId, connectionId }, "WS connection established");

      await registerConnection({ connectionId, userId, connectedAt, ip }, ws);
      await updatePresence(userId, "online");

      sessionMeta.set(connectionId, { startedAt: Date.now(), clientType });
      recordWsConnected(clientType);
      emitSessionEvent("SESSION_STARTED", userId, {
        connectionId,
        clientType,
        connectedAt,
      });

      ws.send(JSON.stringify({ type: "Welcome", userId, connectionId }));

      // Attach hubs
      attachTableHub(ws, userId, connectionId);
      attachLobbyHub(ws, connectionId);
      attachChatHub(ws, userId, connectionId);

      // Heartbeat
      setupHeartbeat(ws, () => {
        logger.info({ userId, connectionId }, "WS connection timed out");
      });

      ws.on("close", async () => {
        await unregisterConnection(connectionId, userId);
        const remaining = await getConnectionsByUser(userId);
        if (remaining.length === 0) {
          await updatePresence(userId, "offline");
        }
        const meta = sessionMeta.get(connectionId);
        sessionMeta.delete(connectionId);
        const durationMs = meta ? Date.now() - meta.startedAt : undefined;
        recordWsDisconnected(meta?.clientType ?? getClientType(request), durationMs);
        emitSessionEvent("SESSION_ENDED", userId, {
          connectionId,
          durationMs,
          clientType: meta?.clientType ?? getClientType(request),
        });
        logger.info({ userId, connectionId }, "WS connection closed");
      });

      ws.on("error", (error) => {
        logger.error({ err: error, userId, connectionId }, "WS connection error");
      });
    };

    if (authResult.status === "ok") {
      await finalizeConnection(authResult.userId);
      return;
    }

    const authTimer = setTimeout(() => {
      closeWithAuthError(ws, "Authentication required");
    }, authTimeoutMs);

    const handleAuth = async (data: WebSocket.RawData) => {
      clearTimeout(authTimer);
      ws.off("message", handleAuth);

      let message: { type?: string; token?: string } | undefined;
      try {
        message = JSON.parse(data.toString()) as { type?: string; token?: string };
      } catch {
        closeWithAuthError(ws, "Invalid authentication payload");
        return;
      }

      if (message?.type !== "Authenticate" || typeof message?.token !== "string") {
        closeWithAuthError(ws, "Authentication required");
        return;
      }

      const result = await authenticateWsToken(message.token);
      if (result.status !== "ok") {
        closeWithAuthError(ws, "Unauthorized");
        return;
      }

      await finalizeConnection(result.userId);
    };

    ws.on("message", handleAuth);
  });

  return wss;
}
