import { saveConnection, deleteConnection, ConnectionInfo } from "../storage/connectionStore";
import { registerLocalSocket, unregisterLocalSocket } from "./localRegistry";
import WebSocket from "ws";
import { getWsInstanceId } from "./pubsub";

export async function registerConnection(
  params: { connectionId: string; userId: string; connectedAt: string; ip: string },
  socket: WebSocket,
) {
  const info: ConnectionInfo = {
    ...params,
    instanceId: getWsInstanceId()
  };
  await saveConnection(info);
  registerLocalSocket(params.connectionId, socket, { userId: params.userId, ip: params.ip });
}

export async function unregisterConnection(connectionId: string, userId: string) {
  await deleteConnection(connectionId, userId);
  unregisterLocalSocket(connectionId);
}
