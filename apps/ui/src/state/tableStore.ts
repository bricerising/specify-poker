import { apiFetch, getApiBaseUrl } from '../services/apiClient';
import { getToken } from '../services/auth';
import { isStaleVersion, requestResync, shouldResync } from '../services/wsClient';
import { recordWebSocketMessage } from '../observability/otel';
import { decodeJwtUserId } from '../utils/jwt';
import { asRecord, readTrimmedString } from '../utils/unknown';
import type { z } from 'zod';
import { wsServerMessageSchema } from '@specify-poker/shared/schemas';

import { applyTablePatch } from './tablePatching';
import {
  cardToString,
  normalizeChatMessage,
  normalizeConfig,
  normalizeTableState,
  normalizeTableSummary,
  type UnknownRecord,
} from './tableNormalization';
import { inferSeatIdForUserId } from './seatResolver';
import type {
  ChatMessage,
  SpectatorView,
  TableSeat,
  TableState,
  TableStore,
  TableStoreState,
} from './tableTypes';

export type {
  ChatMessage,
  HandState,
  SpectatorView,
  TableConfig,
  TableSeat,
  TableState,
  TableStore,
  TableStoreState,
  TableSummary,
} from './tableTypes';

type WsServerMessage = z.infer<typeof wsServerMessageSchema>;

function currentUserIdFromToken(): string | null {
  const token = getToken();
  if (!token) {
    return null;
  }
  return decodeJwtUserId(token);
}

function toIncomingVersion(
  message: Extract<WsServerMessage, { type: 'TableSnapshot' | 'TablePatch' }>,
) {
  if (message.type === 'TableSnapshot') {
    return message.tableState.version;
  }

  const value = message.patch.version;
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createTableStore(): TableStore {
  let state: TableStoreState = {
    tables: [],
    tableState: null,
    seatId: null,
    isSpectating: false,
    status: 'idle',
    chatMessages: [],
    privateHoleCards: null,
    privateHandId: null,
  };

  const listeners = new Set<(state: TableStoreState) => void>();
  let socket: WebSocket | null = null;
  const requestedHoleCards = new Set<string>();
  const profileCache = new Map<string, { username: string; avatarUrl: string | null }>();
  const requestedProfiles = new Set<string>();

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

  const sendWhenSocketOpen = (send: (socket: WebSocket) => void) => {
    if (!socket) {
      return;
    }
    const activeSocket = socket;
    if (activeSocket.readyState === WebSocket.OPEN) {
      send(activeSocket);
      return;
    }
    activeSocket.addEventListener('open', () => send(activeSocket), { once: true });
  };

  type WsClientMessage = { type: string; tableId?: string } & Record<string, unknown>;

  const sendWsMessage = (activeSocket: WebSocket, message: WsClientMessage) => {
    recordWebSocketMessage(
      message.type,
      'sent',
      typeof message.tableId === 'string' ? message.tableId : undefined,
    );
    activeSocket.send(JSON.stringify(message));
  };

  const sendWsMessageNow = (message: WsClientMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    sendWsMessage(socket, message);
    return true;
  };

  const sendWsMessageOnOpen = (message: WsClientMessage) => {
    sendWhenSocketOpen((activeSocket) => {
      sendWsMessage(activeSocket, message);
    });
  };

  const clearRequestedHoleCards = () => {
    requestedHoleCards.clear();
  };

  const applyCachedProfiles = (tableState: TableState): TableState => {
    let changed = false;
    const seats = tableState.seats.map((seat) => {
      if (!seat.userId) {
        return seat;
      }
      const cached = profileCache.get(seat.userId);
      if (!cached) {
        return seat;
      }
      const currentUsername = typeof seat.username === 'string' ? seat.username.trim() : '';
      const shouldSetUsername = !currentUsername || currentUsername === seat.userId;
      const shouldSetAvatar =
        (seat.avatarUrl === undefined || seat.avatarUrl === null) && cached.avatarUrl !== null;

      if (!shouldSetUsername && !shouldSetAvatar) {
        return seat;
      }

      changed = true;
      return {
        ...seat,
        ...(shouldSetUsername ? { username: cached.username } : {}),
        ...(shouldSetAvatar ? { avatarUrl: cached.avatarUrl } : {}),
      };
    });

    const spectators = tableState.spectators?.map((spectator) => {
      if (!spectator.userId || spectator.username) {
        return spectator;
      }
      const cached = profileCache.get(spectator.userId);
      if (!cached) {
        return spectator;
      }
      changed = true;
      return { ...spectator, username: cached.username };
    });

    if (!changed) {
      return tableState;
    }

    return {
      ...tableState,
      seats,
      ...(spectators ? { spectators } : {}),
    };
  };

  async function fetchPublicProfile(
    userId: string,
  ): Promise<{ username: string; avatarUrl: string | null } | null> {
    if (!userId) {
      return null;
    }
    try {
      const response = await apiFetch(`/api/profile/${encodeURIComponent(userId)}`);
      const payload = asRecord(await response.json());
      const username = readTrimmedString(payload?.username ?? payload?.nickname);
      if (!username) {
        return null;
      }
      const avatarUrl = readTrimmedString(payload?.avatarUrl ?? payload?.avatar_url) ?? null;
      return { username, avatarUrl };
    } catch {
      return null;
    }
  }

  const requestMissingProfiles = (tableState: TableState) => {
    const userIds = new Set<string>();
    for (const seat of tableState.seats) {
      const username = typeof seat.username === 'string' ? seat.username.trim() : '';
      const needsUsername = !username || username === seat.userId;
      const needsAvatar = seat.avatarUrl === undefined || seat.avatarUrl === null;
      if (!seat.userId || profileCache.has(seat.userId) || (!needsUsername && !needsAvatar)) {
        continue;
      }
      userIds.add(seat.userId);
    }
    for (const spectator of tableState.spectators ?? []) {
      const username = typeof spectator.username === 'string' ? spectator.username.trim() : '';
      const needsUsername = !username || username === spectator.userId;
      if (!spectator.userId || profileCache.has(spectator.userId) || !needsUsername) {
        continue;
      }
      userIds.add(spectator.userId);
    }

    for (const userId of userIds) {
      if (requestedProfiles.has(userId)) {
        continue;
      }
      requestedProfiles.add(userId);
      void fetchPublicProfile(userId).then((profile) => {
        requestedProfiles.delete(userId);
        if (!profile) {
          return;
        }
        profileCache.set(userId, profile);

        const current = state.tableState;
        if (!current || current.tableId !== tableState.tableId) {
          return;
        }

        const updated = applyCachedProfiles(current);
        if (updated !== current) {
          setState({ tableState: updated });
        }
      });
    }
  };

  async function fetchHoleCardsForHand(
    tableId: string,
    expectedHandId: string,
  ): Promise<string[] | null> {
    try {
      const response = await apiFetch(`/api/tables/${tableId}/state`);
      const payload = asRecord(await response.json());
      const statePayload = asRecord(payload?.state);
      if (!payload || !statePayload) {
        return null;
      }

      const handPayload = asRecord(statePayload.hand);
      const handId = readTrimmedString(handPayload?.handId ?? handPayload?.hand_id);

      if (!handId || handId !== expectedHandId) {
        return null;
      }

      const holeCardsPayload = Array.isArray(payload.hole_cards)
        ? payload.hole_cards
        : Array.isArray(payload.holeCards)
          ? payload.holeCards
          : [];
      const cards = holeCardsPayload
        .map((card) => cardToString(card))
        .filter((card): card is string => Boolean(card));

      return cards.length === 2 ? cards : null;
    } catch {
      return null;
    }
  }

  async function loadHoleCardsWithRetry(
    tableId: string,
    handId: string,
    attempts = 12,
  ): Promise<string[] | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (state.tableState?.tableId !== tableId || state.isSpectating || state.seatId === null) {
        return null;
      }
      if (
        state.privateHandId === handId &&
        state.privateHoleCards &&
        state.privateHoleCards.length === 2
      ) {
        return state.privateHoleCards;
      }
      const cards = await fetchHoleCardsForHand(tableId, handId);
      if (cards) {
        return cards;
      }
      await sleep(250);
    }
    return null;
  }

  const requestPrivateHoleCards = (tableId: string, handId: string) => {
    if (state.seatId === null || state.isSpectating) {
      return;
    }

    const key = `${tableId}:${handId}`;
    if (requestedHoleCards.has(key)) {
      return;
    }
    requestedHoleCards.add(key);

    requestResync(socket, tableId);

    void loadHoleCardsWithRetry(tableId, handId).then((cards) => {
      requestedHoleCards.delete(key);
      if (!cards) {
        return;
      }
      if (state.tableState?.tableId !== tableId) {
        return;
      }
      if (state.tableState?.hand?.handId !== handId) {
        return;
      }
      if (state.seatId === null || state.isSpectating) {
        return;
      }
      setState({ privateHoleCards: cards, privateHandId: handId });
    });
  };

  const buildPlaceholderTableState = (tableId: string): TableState => {
    const fallback = state.tables.find((table) => table.tableId === tableId);
    const config = normalizeConfig(undefined, fallback?.config);
    const seatCount = Math.max(0, config.maxPlayers);
    const seats: TableSeat[] = Array.from({ length: seatCount }, (_, index) => ({
      seatId: index,
      userId: null,
      avatarUrl: null,
      stack: 0,
      status: 'EMPTY',
    }));

    return {
      tableId,
      name: fallback?.name ?? 'Table',
      ownerId: fallback?.ownerId ?? '',
      config,
      seats,
      spectators: [],
      status: 'lobby',
      hand: null,
      button: 0,
      version: -1,
    };
  };

  const handleTableStateMessage = (
    message: Extract<WsServerMessage, { type: 'TableSnapshot' | 'TablePatch' }>,
  ) => {
    const activeTableState = state.tableState;
    const tableId = message.type === 'TablePatch' ? message.tableId : message.tableState.tableId;
    if (!activeTableState || !tableId || tableId !== activeTableState.tableId) {
      return;
    }

    const currentVersion = activeTableState.version;
    const incomingVersion = toIncomingVersion(message);
    if (incomingVersion !== null) {
      if (isStaleVersion(currentVersion, incomingVersion)) {
        return;
      }
      if (shouldResync(currentVersion, incomingVersion)) {
        requestResync(socket, tableId);
      }
    }

    const fallback = state.tables.find((table) => table.tableId === tableId);
    const normalized =
      message.type === 'TablePatch'
        ? applyCachedProfiles(applyTablePatch(activeTableState, message.patch, fallback))
        : applyCachedProfiles(normalizeTableState(message.tableState as UnknownRecord, fallback));

    const tokenUserId = currentUserIdFromToken();
    const inferredSeatId = inferSeatIdForUserId(normalized, tokenUserId);

    const shouldAdoptSeat =
      inferredSeatId !== null &&
      (state.seatId === null || state.isSpectating || state.seatId !== inferredSeatId);
    const effectiveSeatId = shouldAdoptSeat ? inferredSeatId : state.seatId;
    const effectiveIsSpectating = shouldAdoptSeat ? false : state.isSpectating;

    const incomingHandId = normalized.hand?.handId ?? null;
    const shouldRequestHoleCards =
      Boolean(incomingHandId) &&
      effectiveSeatId !== null &&
      !effectiveIsSpectating &&
      (shouldAdoptSeat ||
        state.privateHoleCards === null ||
        state.privateHandId !== incomingHandId);
    const clearPrivate =
      !incomingHandId || (state.privateHandId !== null && state.privateHandId !== incomingHandId);

    setState({
      tableState: normalized,
      ...(shouldAdoptSeat ? { seatId: inferredSeatId, isSpectating: false } : {}),
      ...(clearPrivate ? { privateHoleCards: null, privateHandId: null } : {}),
    });

    requestMissingProfiles(normalized);
    if (incomingHandId && shouldRequestHoleCards) {
      requestPrivateHoleCards(tableId, incomingHandId);
    }
  };

  const handleHoleCardsMessage = (message: Extract<WsServerMessage, { type: 'HoleCards' }>) => {
    const cards = message.cards
      .map((card) => cardToString(card))
      .filter((card): card is string => Boolean(card));
    const handId = message.handId ?? null;
    if (cards && cards.length === 2) {
      setState({ privateHoleCards: cards, privateHandId: handId });
    }
  };

  const handleChatMessage = (message: Extract<WsServerMessage, { type: 'ChatMessage' }>) => {
    const normalized = normalizeChatMessage(message.message);
    if (!normalized) {
      return;
    }
    setState({ chatMessages: [...state.chatMessages, normalized], chatError: undefined });
  };

  const handleChatSubscribed = (message: Extract<WsServerMessage, { type: 'ChatSubscribed' }>) => {
    const history = message.history ?? [];
    const chatMessages = history
      .map(normalizeChatMessage)
      .filter((entry): entry is ChatMessage => Boolean(entry));
    setState({ chatMessages, chatError: undefined });
  };

  const handleChatError = (message: Extract<WsServerMessage, { type: 'ChatError' }>) => {
    setState({ chatError: message.reason });
  };

  const handleLobbyTablesUpdated = (
    message: Extract<WsServerMessage, { type: 'LobbyTablesUpdated' }>,
  ) => {
    setState({ tables: message.tables });
  };

  const handleTimerUpdate = (message: Extract<WsServerMessage, { type: 'TimerUpdate' }>) => {
    const handId = message.handId;
    const deadlineTs = message.deadlineTs;
    const currentTurnSeat = message.currentTurnSeat;
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
  };

  const handleSpectatorMessage = (
    message: Extract<WsServerMessage, { type: 'SpectatorJoined' | 'SpectatorLeft' }>,
  ) => {
    const spectatorCount = message.spectatorCount;
    if (!state.tableState || spectatorCount === undefined) {
      return;
    }

    const spectators = state.tableState.spectators ?? [];
    if (message.type === 'SpectatorJoined') {
      const newSpectator: SpectatorView = {
        userId: message.userId,
        username: message.username,
        status: 'active',
      };
      setState({
        tableState: {
          ...state.tableState,
          spectators: [...spectators.filter((s) => s.userId !== newSpectator.userId), newSpectator],
        },
      });
      return;
    }

    setState({
      tableState: {
        ...state.tableState,
        spectators: spectators.filter((s) => s.userId !== message.userId),
      },
    });
  };

  const handleServerErrorMessage = (message: Extract<WsServerMessage, { type: 'Error' }>) => {
    setState({ status: 'error', error: message.message });
  };

  type WsHandlerMap = {
    [Type in WsServerMessage['type']]: (message: Extract<WsServerMessage, { type: Type }>) => void;
  };

  const wsHandlers = {
    Welcome: () => undefined,
    Error: handleServerErrorMessage,
    LobbyTablesUpdated: handleLobbyTablesUpdated,
    TableSnapshot: (message) => handleTableStateMessage(message),
    TablePatch: (message) => handleTableStateMessage(message),
    HoleCards: handleHoleCardsMessage,
    ActionResult: () => undefined,
    ChatSubscribed: handleChatSubscribed,
    ChatError: handleChatError,
    ChatMessage: handleChatMessage,
    TimerUpdate: handleTimerUpdate,
    SpectatorJoined: (message) => handleSpectatorMessage(message),
    SpectatorLeft: (message) => handleSpectatorMessage(message),
  } satisfies WsHandlerMap;

  const handleWsServerMessage = (message: WsServerMessage) => {
    const handler = wsHandlers[message.type] as (message: WsServerMessage) => void;
    handler(message);
  };

  const tableIdForMessage = (message: WsServerMessage): string | undefined => {
    if ('tableId' in message && typeof message.tableId === 'string') {
      return message.tableId;
    }
    if (message.type === 'TableSnapshot') {
      return message.tableState.tableId;
    }
    return undefined;
  };

  const connect = (wsUrl?: string) => {
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    const apiBase = getApiBaseUrl();
    const baseUrl = wsUrl ?? apiBase.replace(/^http/, 'ws') + '/ws';
    const token = getToken();
    const url = new URL(baseUrl, window.location.origin);
    if (token && !url.searchParams.has('token')) {
      url.searchParams.set('token', token);
    }
    setState({ status: 'connecting', error: undefined });
    const nextSocket = new WebSocket(url.toString());
    socket = nextSocket;

    nextSocket.addEventListener('open', () => {
      if (socket !== nextSocket) {
        return;
      }
      setState({ status: 'connected', error: undefined });
    });

    nextSocket.addEventListener('close', () => {
      if (socket !== nextSocket) {
        return;
      }
      socket = null;
      setState({ status: 'idle' });
    });

    nextSocket.addEventListener('error', () => {
      if (socket !== nextSocket) {
        return;
      }
      setState({ status: 'error', error: 'WebSocket error' });
    });

    nextSocket.addEventListener('message', (event) => {
      if (socket !== nextSocket) {
        return;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const parsed = wsServerMessageSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }

      const message: WsServerMessage = parsed.data;
      recordWebSocketMessage(message.type, 'received', tableIdForMessage(message));
      handleWsServerMessage(message);
    });
  };

  const loadTableSnapshot = async (tableId: string) => {
    try {
      const response = await apiFetch(`/api/tables/${tableId}/state`);
      const payload = asRecord(await response.json());
      const statePayload = asRecord(payload?.state);
      if (!payload || !statePayload) {
        return null;
      }
      const fallback = state.tables.find((table) => table.tableId === tableId);
      const tableState = applyCachedProfiles(normalizeTableState(statePayload, fallback));
      const holeCardsPayload = Array.isArray(payload.hole_cards)
        ? payload.hole_cards
        : Array.isArray(payload.holeCards)
          ? payload.holeCards
          : [];
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

  type EnterTableMode =
    | { kind: 'seat'; seatId: number; wsUrl?: string }
    | { kind: 'spectate'; wsUrl?: string };

  const enterTable = (tableId: string, mode: EnterTableMode) => {
    clearRequestedHoleCards();
    const snapshotPromise = loadTableSnapshotWithRetry(tableId);
    const placeholder = buildPlaceholderTableState(tableId);

    setState({
      tableState: placeholder,
      seatId: mode.kind === 'seat' ? mode.seatId : null,
      isSpectating: mode.kind === 'spectate',
      chatMessages: [],
      chatError: undefined,
      privateHoleCards: null,
      privateHandId: null,
    });

    connect(mode.wsUrl);
    sendWhenSocketOpen((activeSocket) => {
      sendWsMessage(activeSocket, { type: 'SubscribeTable', tableId });
      sendWsMessage(activeSocket, { type: 'SubscribeChat', tableId });
    });

    snapshotPromise.then((snapshot) => {
      if (!snapshot?.tableState) {
        return;
      }
      if (state.tableState?.tableId !== tableId) {
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
      requestMissingProfiles(snapshot.tableState);
    });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fetchTables: async () => {
      const response = await apiFetch('/api/tables');
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error('Invalid tables response');
      }
      const tables = payload
        .map((entry) => asRecord(entry))
        .filter((entry): entry is UnknownRecord => Boolean(entry))
        .map((table) => normalizeTableSummary(table));
      setState({ tables });
    },
    subscribeLobby: () => {
      connect();
    },
    joinSeat: async (tableId, seatId) => {
      const response = await apiFetch(`/api/tables/${tableId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatId }),
      });
      const payload = asRecord(await response.json());
      const wsUrl = readTrimmedString(payload?.wsUrl) ?? undefined;
      enterTable(tableId, { kind: 'seat', seatId, wsUrl });
    },
    spectateTable: (tableId) => {
      enterTable(tableId, { kind: 'spectate' });
    },
    leaveTable: () => {
      clearRequestedHoleCards();
      const tableId = state.tableState?.tableId;
      if (tableId) {
        sendWsMessageNow({ type: 'UnsubscribeTable', tableId });
        sendWsMessageNow({ type: 'UnsubscribeChat', tableId });
        if (state.seatId !== null) {
          sendWsMessageNow({ type: 'LeaveTable', tableId });
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
      sendWsMessageOnOpen({ type: 'SubscribeTable', tableId });
    },
    sendAction: (action) => {
      if (!state.tableState?.hand) {
        return;
      }
      sendWsMessageNow({
        type: 'Action',
        tableId: state.tableState.tableId,
        handId: state.tableState.hand.handId,
        action: action.type,
        amount: action.amount,
      });
    },
    subscribeChat: (tableId) => {
      connect();
      sendWsMessageOnOpen({ type: 'SubscribeChat', tableId });
    },
    sendChat: (message) => {
      if (!state.tableState) {
        return;
      }
      sendWsMessageNow({ type: 'ChatSend', tableId: state.tableState.tableId, message });
    },
  };
}

export const tableStore = createTableStore();
