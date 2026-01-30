export type WebSocketTransportStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type WebSocketTransport<
  ClientMessage extends { readonly type: string; readonly tableId?: string },
> = {
  connect(wsUrl?: string): void;
  getSocket(): WebSocket | null;
  sendNow(message: ClientMessage): boolean;
  sendOnOpen(message: ClientMessage): void;
  cancelOutbox(shouldCancel: (message: ClientMessage) => boolean): void;
};

type CreateWebSocketTransportParams<
  ServerMessage,
  ClientMessage extends { readonly type: string; readonly tableId?: string },
> = {
  readonly buildUrl: (wsUrl?: string) => string;
  readonly decodeServerMessage: (payload: unknown) => ServerMessage | null;
  readonly beforeServerMessage?: (message: ServerMessage) => void;
  readonly onServerMessage: (message: ServerMessage) => void;
  readonly onConnecting?: () => void;
  readonly onConnected?: () => void;
  readonly onClosed?: () => void;
  readonly onError?: () => void;
  readonly onClientMessageSent?: (message: ClientMessage) => void;
};

export function createWebSocketTransport<
  ServerMessage,
  ClientMessage extends { readonly type: string; readonly tableId?: string },
>(params: CreateWebSocketTransportParams<ServerMessage, ClientMessage>): WebSocketTransport<ClientMessage> {
  let socket: WebSocket | null = null;
  const outbox: ClientMessage[] = [];

  const sendMessage = (activeSocket: WebSocket, message: ClientMessage) => {
    params.onClientMessageSent?.(message);
    activeSocket.send(JSON.stringify(message));
  };

  const flushOutbox = (activeSocket: WebSocket) => {
    if (socket !== activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    while (outbox.length > 0) {
      const message = outbox.shift();
      if (!message) {
        return;
      }
      sendMessage(activeSocket, message);
    }
  };

  const handleServerMessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string') {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(event.data) as unknown;
    } catch {
      return;
    }

    const message = params.decodeServerMessage(payload);
    if (message == null) {
      return;
    }

    params.beforeServerMessage?.(message);
    params.onServerMessage(message);
  };

  const connect: WebSocketTransport<ClientMessage>['connect'] = (wsUrl) => {
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    params.onConnecting?.();
    const nextSocket = new WebSocket(params.buildUrl(wsUrl));
    socket = nextSocket;

    nextSocket.addEventListener('open', () => {
      if (socket !== nextSocket) {
        return;
      }
      flushOutbox(nextSocket);
      params.onConnected?.();
    });

    nextSocket.addEventListener('close', () => {
      if (socket !== nextSocket) {
        return;
      }
      socket = null;
      params.onClosed?.();
    });

    nextSocket.addEventListener('error', () => {
      if (socket !== nextSocket) {
        return;
      }
      params.onError?.();
    });

    nextSocket.addEventListener('message', (event) => {
      if (socket !== nextSocket) {
        return;
      }
      handleServerMessage(event);
    });
  };

  const sendNow: WebSocketTransport<ClientMessage>['sendNow'] = (message) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    sendMessage(socket, message);
    return true;
  };

  const sendOnOpen: WebSocketTransport<ClientMessage>['sendOnOpen'] = (message) => {
    if (!socket) {
      return;
    }

    if (socket.readyState === WebSocket.OPEN) {
      sendMessage(socket, message);
      return;
    }

    if (typeof message.tableId === 'string') {
      for (let index = outbox.length - 1; index >= 0; index -= 1) {
        const queued = outbox[index];
        if (queued?.type === message.type && queued.tableId === message.tableId) {
          outbox.splice(index, 1);
        }
      }
    }

    outbox.push(message);
  };

  const cancelOutbox: WebSocketTransport<ClientMessage>['cancelOutbox'] = (
    shouldCancel,
  ) => {
    if (outbox.length === 0) {
      return;
    }
    const remaining = outbox.filter((message) => !shouldCancel(message));
    outbox.length = 0;
    outbox.push(...remaining);
  };

  return {
    connect,
    getSocket: () => socket,
    sendNow,
    sendOnOpen,
    cancelOutbox,
  };
}
