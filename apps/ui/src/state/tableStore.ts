import { apiFetch, getApiBaseUrl } from "../services/apiClient";
import { getToken } from "../services/auth";
import { isStaleVersion, requestResync, shouldResync } from "../services/wsClient";

type UnknownRecord = Record<string, unknown>;

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConfig(raw: UnknownRecord | undefined): TableConfig {
  return {
    smallBlind: toNumber(raw?.small_blind ?? raw?.smallBlind, 1),
    bigBlind: toNumber(raw?.big_blind ?? raw?.bigBlind, 2),
    ante: raw?.ante === undefined || raw?.ante === null ? null : toNumber(raw.ante, 0),
    maxPlayers: toNumber(raw?.max_players ?? raw?.maxPlayers, 6),
    startingStack: toNumber(raw?.starting_stack ?? raw?.startingStack, 200),
    bettingStructure: "NoLimit",
  };
}

function normalizeTableSummary(raw: UnknownRecord): TableSummary {
  return {
    tableId: String(raw.tableId ?? raw.table_id ?? ""),
    name: String(raw.name ?? "Table"),
    ownerId: String(raw.ownerId ?? raw.owner_id ?? ""),
    config: normalizeConfig((raw.config ?? {}) as UnknownRecord),
    seatsTaken: toNumber(raw.seatsTaken ?? raw.seats_taken, 0),
    occupiedSeatIds: (raw.occupiedSeatIds ?? raw.occupied_seat_ids ?? []) as number[],
    inProgress: Boolean(raw.inProgress ?? raw.in_progress ?? false),
    spectatorCount: toNumber(raw.spectatorCount ?? raw.spectator_count, 0),
  };
}

function normalizeSeat(raw: UnknownRecord): TableSeat {
  return {
    seatId: toNumber(raw.seatId ?? raw.seat_id, 0),
    userId: (raw.userId ?? raw.user_id ?? null) as string | null,
    nickname: raw.nickname as string | undefined,
    stack: toNumber(raw.stack, 0),
    status: String(raw.status ?? "EMPTY"),
  };
}

function normalizeChatMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as UnknownRecord;
  const id = typeof record.id === "string" ? record.id : "";
  const userId =
    typeof record.userId === "string"
      ? record.userId
      : typeof record.user_id === "string"
        ? record.user_id
        : "";
  const text = typeof record.text === "string" ? record.text : "";
  const ts = typeof record.ts === "string" ? record.ts : "";
  const nickname = typeof record.nickname === "string" ? record.nickname : undefined;
  if (!id || !userId || !text || !ts) {
    return null;
  }
  return { id, userId, nickname, text, ts };
}

function cardToString(card: unknown): string | null {
  if (typeof card === "string") {
    return card;
  }
  if (card && typeof card === "object") {
    const raw = card as { rank?: string; suit?: string };
    const rank = raw.rank;
    const suit = raw.suit;
    if (typeof rank === "string" && typeof suit === "string") {
      const normalizedSuit = suit.trim().toLowerCase();
      const suitChar =
        normalizedSuit.startsWith("h")
          ? "h"
          : normalizedSuit.startsWith("d")
            ? "d"
            : normalizedSuit.startsWith("c")
              ? "c"
              : normalizedSuit.startsWith("s")
                ? "s"
                : normalizedSuit.charAt(0);
      return `${rank}${suitChar}`;
    }
  }
  return null;
}

function normalizeHand(raw: UnknownRecord | null | undefined, config: TableConfig): HandState | null {
  if (!raw) {
    return null;
  }

  const community = (raw.communityCards ?? raw.community_cards ?? []) as unknown[];
  const communityCards = community
    .map((card) => cardToString(card))
    .filter((card): card is string => Boolean(card));
  const pots = ((raw.pots ?? []) as UnknownRecord[]).map((pot) => ({
    amount: toNumber(pot.amount, 0),
    eligibleSeatIds: (pot.eligibleSeatIds ?? pot.eligible_seat_ids ?? []) as number[],
  }));

  return {
    handId: String(raw.handId ?? raw.hand_id ?? ""),
    currentStreet: String(raw.currentStreet ?? raw.street ?? "Lobby"),
    currentTurnSeat: toNumber(raw.currentTurnSeat ?? raw.turn, 0),
    currentBet: toNumber(raw.currentBet ?? raw.current_bet, 0),
    minRaise: toNumber(raw.minRaise ?? raw.min_raise, 0),
    raiseCapped: Boolean(raw.raiseCapped ?? raw.raise_capped ?? false),
    roundContributions: (raw.roundContributions ?? raw.round_contributions ?? {}) as Record<number, number>,
    actedSeats: (raw.actedSeats ?? raw.acted_seats ?? []) as number[],
    communityCards,
    pots,
    actionTimerDeadline: (raw.actionTimerDeadline ?? raw.action_timer_deadline ?? null) as string | null,
    bigBlind: toNumber(raw.bigBlind ?? raw.big_blind ?? config.bigBlind, config.bigBlind),
  };
}

function normalizeTableState(raw: UnknownRecord, fallback?: TableSummary): TableState {
  const config = normalizeConfig((raw.config ?? fallback?.config ?? {}) as UnknownRecord);
  return {
    tableId: String(raw.tableId ?? raw.table_id ?? fallback?.tableId ?? ""),
    name: String(raw.name ?? fallback?.name ?? "Table"),
    ownerId: String(raw.ownerId ?? raw.owner_id ?? fallback?.ownerId ?? ""),
    config,
    seats: ((raw.seats ?? []) as UnknownRecord[]).map(normalizeSeat),
    spectators: ((raw.spectators ?? []) as UnknownRecord[]).map((spectator) => ({
      userId: String(spectator.userId ?? spectator.user_id ?? ""),
      nickname: spectator.nickname as string | undefined,
      status: String(spectator.status ?? "active") as SpectatorView["status"],
    })),
    status: String(raw.status ?? (raw.hand ? "in_hand" : "lobby")),
    hand: normalizeHand(raw.hand as UnknownRecord | null | undefined, config),
    version: toNumber(raw.version, 0),
  };
}

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
  nickname?: string;
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

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const buildPlaceholderTableState = (tableId: string): TableState => {
    const fallback = state.tables.find((table) => table.tableId === tableId);
    const config = fallback?.config ?? normalizeConfig(undefined);
    const seatCount = Math.max(0, config.maxPlayers);
    const seats: TableSeat[] = Array.from({ length: seatCount }, (_, index) => ({
      seatId: index,
      userId: null,
      stack: 0,
      status: "EMPTY",
    }));

    return {
      tableId,
      name: fallback?.name ?? "Table",
      ownerId: fallback?.ownerId ?? "",
      config,
      seats,
      spectators: [],
      status: "lobby",
      hand: null,
      version: -1,
    };
  };

  const connect = (wsUrl?: string) => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
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
          ? (message.tableState as UnknownRecord | undefined)
          : (message.patch as UnknownRecord | undefined);
        if (!incoming) {
          return;
        }
        const currentVersion = state.tableState?.version ?? null;
        const incomingVersion = toNumber(incoming.version, 0);
        if (isStaleVersion(currentVersion, incomingVersion)) {
          return;
        }
        if (shouldResync(currentVersion, incomingVersion)) {
          const tableId = String(incoming.tableId ?? incoming.table_id ?? "");
          requestResync(socket, tableId);
        }
        const tableId = String(incoming.tableId ?? incoming.table_id ?? "");
        const fallback = state.tables.find((table) => table.tableId === tableId);
        const normalized = normalizeTableState(incoming, fallback);
        const incomingHandId = normalized.hand?.handId ?? null;
        const clearPrivate =
          !incomingHandId || (state.privateHandId && state.privateHandId !== incomingHandId);
        setState({
          tableState: normalized,
          ...(clearPrivate ? { privateHoleCards: null, privateHandId: null } : {}),
        });
        return;
      }
      if (message.type === "HoleCards") {
        const cards = (message.cards as unknown[] | undefined)
          ?.map((card) => cardToString(card))
          .filter((card): card is string => Boolean(card));
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
      if (message.type === "ChatSubscribed") {
        const history = (message.history as unknown[] | undefined) ?? [];
        const chatMessages = history.map(normalizeChatMessage).filter((entry): entry is ChatMessage => Boolean(entry));
        setState({ chatMessages, chatError: undefined });
        return;
      }
      if (message.type === "ChatError") {
        setState({ chatError: message.reason });
        return;
      }
      if (message.type === "LobbyTablesUpdated") {
        const tables = (message.tables as UnknownRecord[] | undefined)?.map((table) =>
          normalizeTableSummary(table),
        );
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

  const loadTableSnapshot = async (tableId: string) => {
    try {
      const response = await apiFetch(`/api/tables/${tableId}/state`);
      const payload = (await response.json()) as {
        state?: UnknownRecord;
        hole_cards?: unknown[];
        holeCards?: unknown[];
      };
      if (!payload.state) {
        return null;
      }
      const fallback = state.tables.find((table) => table.tableId === tableId);
      const tableState = normalizeTableState(payload.state, fallback);
      const holeCardsPayload = payload.hole_cards ?? payload.holeCards ?? [];
      const privateHoleCards = holeCardsPayload
        .map((card) => cardToString(card))
        .filter((card): card is string => Boolean(card));
      return {
        tableState,
        privateHoleCards: privateHoleCards.length > 0 ? privateHoleCards : null,
        privateHandId: tableState.hand?.handId ?? null,
      };
    } catch {
      return null;
    }
  };

  const loadTableSnapshotWithRetry = async (tableId: string, attempts = 6) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const snapshot = await loadTableSnapshot(tableId);
      if (snapshot?.tableState) {
        return snapshot;
      }
      await sleep(250);
    }
    return null;
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fetchTables: async () => {
      const response = await apiFetch("/api/tables");
      const payload = (await response.json()) as UnknownRecord[];
      const tables = payload.map((table) => normalizeTableSummary(table));
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
      const snapshotPromise = loadTableSnapshotWithRetry(tableId);
      const placeholder = buildPlaceholderTableState(tableId);
      setState({
        tableState: placeholder,
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
      snapshotPromise.then((snapshot) => {
        if (!snapshot?.tableState) {
          return;
        }
        if (state.tableState && snapshot.tableState.version < state.tableState.version) {
          return;
        }
        setState({
          tableState: snapshot.tableState,
          privateHoleCards: snapshot.privateHoleCards ?? state.privateHoleCards,
          privateHandId: snapshot.privateHandId ?? state.privateHandId,
        });
      });
    },
    spectateTable: async (tableId) => {
      const snapshotPromise = loadTableSnapshotWithRetry(tableId);
      const placeholder = buildPlaceholderTableState(tableId);
      setState({
        tableState: placeholder,
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
      snapshotPromise.then((snapshot) => {
        if (!snapshot?.tableState) {
          return;
        }
        if (state.tableState && snapshot.tableState.version < state.tableState.version) {
          return;
        }
        setState({
          tableState: snapshot.tableState,
          privateHoleCards: snapshot.privateHoleCards ?? state.privateHoleCards,
          privateHandId: snapshot.privateHandId ?? state.privateHandId,
        });
      });
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
