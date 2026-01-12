import { apiFetch, getApiBaseUrl } from "../services/apiClient";
import { getToken } from "../services/auth";
import { isStaleVersion, requestResync, shouldResync } from "../services/wsClient";

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number | null;
  maxPlayers: number;
  startingStack: number;
  bettingStructure: "NoLimit";
}

export interface TableSummary {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  seatsTaken: number;
  occupiedSeatIds: number[];
  inProgress: boolean;
  spectatorCount?: number;
}

export interface SpectatorView {
  userId: string;
  nickname?: string;
  status: "active" | "disconnected";
}

export interface TableSeat {
  seatId: number;
  userId: string | null;
  nickname?: string;
  stack: number;
  status: string;
}

export interface HandState {
  handId: string;
  currentStreet: string;
  currentTurnSeat: number;
  currentBet: number;
  minRaise: number;
  raiseCapped: boolean;
  roundContributions: Record<number, number>;
  actedSeats: number[];
  communityCards: string[];
  pots: { amount: number; eligibleSeatIds: number[] }[];
  actionTimerDeadline: string | null;
  bigBlind: number;
  winners?: number[];
}

export interface TableState {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  seats: TableSeat[];
  spectators?: SpectatorView[];
  status: string;
  hand: HandState | null;
  version: number;
}

export interface TableStoreState {
  tables: TableSummary[];
  tableState: TableState | null;
  seatId: number | null;
  isSpectating: boolean;
  status: "idle" | "connecting" | "connected" | "error";
  error?: string;
  chatMessages: ChatMessage[];
  chatError?: string;
  privateHoleCards: string[] | null;
  privateHandId: string | null;
}

export interface TableStore {
  getState(): TableStoreState;
  subscribe(listener: (state: TableStoreState) => void): () => void;
  fetchTables(): Promise<void>;
  subscribeLobby(): void;
  joinSeat(tableId: string, seatId: number): Promise<void>;
  spectateTable(tableId: string): void;
  leaveTable(): void;
  subscribeTable(tableId: string): void;
  sendAction(action: { type: string; amount?: number }): void;
  subscribeChat(tableId: string): void;
  sendChat(message: string): void;
}

export interface ChatMessage {
  id: string;
  userId: string;
  text: string;
  ts: string;
}

export function createTableStore(): TableStore {
  let state: TableStoreState = {
    tables: [],
    tableState: null,
    seatId: null,
    isSpectating: false,
    status: "idle",
    chatMessages: [],
    privateHoleCards: null,
    privateHandId: null,
  };

  const listeners = new Set<(state: TableStoreState) => void>();
  let socket: WebSocket | null = null;

  const notify = () => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const setState = (next: Partial<TableStoreState>) => {
    state = { ...state, ...next };
    notify();
  };

  const connect = (wsUrl?: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      return;
    }
    const apiBase = getApiBaseUrl();
    const baseUrl = wsUrl ?? apiBase.replace(/^http/, "ws") + "/ws";
    const token = getToken();
    const url = new URL(baseUrl, window.location.origin);
    if (token && !url.searchParams.has("token")) {
      url.searchParams.set("token", token);
    }
    setState({ status: "connecting" });
    socket = new WebSocket(url.toString());

    socket.addEventListener("open", () => {
      setState({ status: "connected" });
    });

    socket.addEventListener("close", () => {
      setState({ status: "idle" });
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string);
      if (message.type === "TableSnapshot" || message.type === "TablePatch") {
        const incoming = message.type === "TableSnapshot"
          ? (message.tableState as TableState | undefined)
          : (message.patch as TableState | undefined);
        if (!incoming) {
          return;
        }
        const currentVersion = state.tableState?.version ?? null;
        const incomingVersion = incoming.version ?? 0;
        if (isStaleVersion(currentVersion, incomingVersion)) {
          return;
        }
        if (shouldResync(currentVersion, incomingVersion)) {
          requestResync(socket, incoming.tableId);
        }
        const incomingHandId = incoming.hand?.handId ?? null;
        const clearPrivate =
          !incomingHandId || (state.privateHandId && state.privateHandId !== incomingHandId);
        setState({
          tableState: incoming,
          ...(clearPrivate ? { privateHoleCards: null, privateHandId: null } : {}),
        });
        return;
      }
      if (message.type === "HoleCards") {
        const cards = message.cards as string[] | undefined;
        const handId = (message.handId as string | undefined) ?? null;
        if (cards && cards.length === 2) {
          setState({ privateHoleCards: cards, privateHandId: handId });
        }
        return;
      }
      if (message.type === "ChatMessage") {
        setState({ chatMessages: [...state.chatMessages, message.message], chatError: undefined });
        return;
      }
      if (message.type === "ChatError") {
        setState({ chatError: message.reason });
        return;
      }
      if (message.type === "LobbyTablesUpdated") {
        const tables = message.tables as TableSummary[] | undefined;
        if (tables) {
          setState({ tables });
        }
        return;
      }
      if (message.type === "TimerUpdate") {
        const handId = message.handId as string | undefined;
        const deadlineTs = message.deadlineTs as string | undefined;
        const currentTurnSeat = message.currentTurnSeat as number | undefined;
        if (!state.tableState?.hand || state.tableState.hand.handId !== handId) {
          return;
        }
        setState({
          tableState: {
            ...state.tableState,
            hand: {
              ...state.tableState.hand,
              actionTimerDeadline: deadlineTs ?? null,
              currentTurnSeat: currentTurnSeat ?? state.tableState.hand.currentTurnSeat,
            },
          },
        });
        return;
      }
      if (message.type === "SpectatorJoined" || message.type === "SpectatorLeft") {
        const spectatorCount = message.spectatorCount as number | undefined;
        if (state.tableState && spectatorCount !== undefined) {
          const spectators = state.tableState.spectators ?? [];
          if (message.type === "SpectatorJoined") {
            const newSpectator: SpectatorView = {
              userId: message.userId as string,
              nickname: message.nickname as string | undefined,
              status: "active",
            };
            setState({
              tableState: {
                ...state.tableState,
                spectators: [...spectators.filter((s) => s.userId !== newSpectator.userId), newSpectator],
              },
            });
          } else {
            setState({
              tableState: {
                ...state.tableState,
                spectators: spectators.filter((s) => s.userId !== message.userId),
              },
            });
          }
        }
      }
    });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fetchTables: async () => {
      const response = await apiFetch("/api/tables");
      const tables = (await response.json()) as TableSummary[];
      setState({ tables });
    },
    subscribeLobby: () => {
      connect();
    },
    joinSeat: async (tableId, seatId) => {
      const response = await apiFetch(`/api/tables/${tableId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId }),
      });
      const payload = await response.json();
      setState({
        seatId,
        isSpectating: false,
        chatMessages: [],
        chatError: undefined,
        privateHoleCards: null,
        privateHandId: null,
      });
      connect(payload.wsUrl);
      const subscribe = () => {
        socket?.send(JSON.stringify({ type: "SubscribeTable", tableId }));
        socket?.send(JSON.stringify({ type: "SubscribeChat", tableId }));
      };
      if (socket?.readyState === WebSocket.OPEN) {
        subscribe();
      } else if (socket) {
        const handleOpen = () => {
          subscribe();
          socket?.removeEventListener("open", handleOpen);
        };
        socket.addEventListener("open", handleOpen);
      }
    },
    spectateTable: (tableId) => {
      setState({
        seatId: null,
        isSpectating: true,
        chatMessages: [],
        chatError: undefined,
        privateHoleCards: null,
        privateHandId: null,
      });
      connect();
      const subscribe = () => {
        socket?.send(JSON.stringify({ type: "SubscribeTable", tableId }));
        socket?.send(JSON.stringify({ type: "SubscribeChat", tableId }));
      };
      if (socket?.readyState === WebSocket.OPEN) {
        subscribe();
      } else if (socket) {
        const handleOpen = () => {
          subscribe();
          socket?.removeEventListener("open", handleOpen);
        };
        socket.addEventListener("open", handleOpen);
      }
    },
    leaveTable: () => {
      const tableId = state.tableState?.tableId;
      if (tableId && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "UnsubscribeTable", tableId }));
        socket.send(JSON.stringify({ type: "UnsubscribeChat", tableId }));
        if (state.seatId !== null) {
          socket.send(JSON.stringify({ type: "LeaveTable", tableId }));
        }
      }
      setState({
        tableState: null,
        seatId: null,
        isSpectating: false,
        chatMessages: [],
        chatError: undefined,
        privateHoleCards: null,
        privateHandId: null,
      });
    },
    subscribeTable: (tableId) => {
      connect();
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "SubscribeTable", tableId }));
      } else {
        socket?.addEventListener("open", () => {
          socket?.send(JSON.stringify({ type: "SubscribeTable", tableId }));
        });
      }
    },
    sendAction: (action) => {
      if (!socket || socket.readyState !== WebSocket.OPEN || !state.tableState?.hand) {
        return;
      }
      socket.send(
        JSON.stringify({
          type: "Action",
          tableId: state.tableState.tableId,
          handId: state.tableState.hand.handId,
          action: action.type,
          amount: action.amount,
        }),
      );
    },
    subscribeChat: (tableId) => {
      if (!socket) {
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "SubscribeChat", tableId }));
      } else {
        socket.addEventListener("open", () => {
          socket?.send(JSON.stringify({ type: "SubscribeChat", tableId }));
        });
      }
    },
    sendChat: (message) => {
      if (!socket || socket.readyState !== WebSocket.OPEN || !state.tableState) {
        return;
      }
      socket.send(
        JSON.stringify({
          type: "ChatSend",
          tableId: state.tableState.tableId,
          message,
        }),
      );
    },
  };
}

export const tableStore = createTableStore();
