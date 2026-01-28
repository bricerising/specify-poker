import type {
  ChatMessage,
  HandState,
  SpectatorView,
  TableConfig,
  TableSeat,
  TableState,
  TableSummary,
} from './tableTypes';

import type { UnknownRecord } from '../utils/unknown';

export type { UnknownRecord } from '../utils/unknown';

const DEFAULT_CONFIG: TableConfig = {
  smallBlind: 1,
  bigBlind: 2,
  ante: null,
  maxPlayers: 6,
  startingStack: 200,
  bettingStructure: 'NoLimit',
};

export function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeConfig(
  raw: UnknownRecord | undefined,
  fallback?: TableConfig,
): TableConfig {
  const base = fallback ?? DEFAULT_CONFIG;
  const rawAnte = raw?.ante;

  return {
    smallBlind: toNumber(raw?.small_blind ?? raw?.smallBlind, base.smallBlind),
    bigBlind: toNumber(raw?.big_blind ?? raw?.bigBlind, base.bigBlind),
    ante:
      rawAnte === undefined
        ? (fallback?.ante ?? DEFAULT_CONFIG.ante)
        : rawAnte === null
          ? null
          : toNumber(rawAnte, 0),
    maxPlayers: toNumber(raw?.max_players ?? raw?.maxPlayers, base.maxPlayers),
    startingStack: toNumber(raw?.starting_stack ?? raw?.startingStack, base.startingStack),
    bettingStructure: 'NoLimit',
  };
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toNumber(entry, Number.NaN))
    .filter((entry) => Number.isFinite(entry));
}

export function normalizeTableSummary(raw: UnknownRecord): TableSummary {
  return {
    tableId: String(raw.tableId ?? raw.table_id ?? ''),
    name: String(raw.name ?? 'Table'),
    ownerId: String(raw.ownerId ?? raw.owner_id ?? ''),
    config: normalizeConfig((raw.config ?? {}) as UnknownRecord),
    seatsTaken: toNumber(raw.seatsTaken ?? raw.seats_taken, 0),
    occupiedSeatIds: normalizeNumberArray(raw.occupiedSeatIds ?? raw.occupied_seat_ids),
    inProgress: Boolean(raw.inProgress ?? raw.in_progress ?? false),
    spectatorCount: toNumber(raw.spectatorCount ?? raw.spectator_count, 0),
  };
}

export function normalizeSeat(raw: UnknownRecord): TableSeat {
  const userIdRaw = raw.userId ?? raw.user_id ?? null;
  const usernameRaw = raw.username ?? raw.nickname;
  const avatarRaw = raw.avatarUrl ?? raw.avatar_url;

  return {
    seatId: toNumber(raw.seatId ?? raw.seat_id, 0),
    userId: typeof userIdRaw === 'string' ? userIdRaw : null,
    username: typeof usernameRaw === 'string' ? usernameRaw : undefined,
    avatarUrl: typeof avatarRaw === 'string' ? avatarRaw : null,
    stack: toNumber(raw.stack, 0),
    status: String(raw.status ?? 'EMPTY'),
  };
}

export function normalizeSpectatorView(raw: UnknownRecord): SpectatorView {
  const usernameRaw = raw.username ?? raw.nickname;
  const statusRaw = raw.status ?? 'active';

  return {
    userId: String(raw.userId ?? raw.user_id ?? ''),
    username: typeof usernameRaw === 'string' ? usernameRaw : undefined,
    status: String(statusRaw) as SpectatorView['status'],
  };
}

export function normalizeChatMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as UnknownRecord;
  const id = typeof record.id === 'string' ? record.id : '';
  const userId =
    typeof record.userId === 'string'
      ? record.userId
      : typeof record.user_id === 'string'
        ? record.user_id
        : '';
  const text = typeof record.text === 'string' ? record.text : '';
  const ts = typeof record.ts === 'string' ? record.ts : '';
  const username =
    typeof record.username === 'string'
      ? record.username
      : typeof record.nickname === 'string'
        ? record.nickname
        : undefined;

  if (!id || !userId || !text || !ts) {
    return null;
  }
  return { id, userId, username, text, ts };
}

export function cardToString(card: unknown): string | null {
  if (typeof card === 'string') {
    return card;
  }
  if (card && typeof card === 'object') {
    const raw = card as { rank?: string; suit?: string };
    const rank = raw.rank;
    const suit = raw.suit;
    if (typeof rank === 'string' && typeof suit === 'string') {
      const normalizedSuit = suit.trim().toLowerCase();
      const suitChar = normalizedSuit.startsWith('h')
        ? 'h'
        : normalizedSuit.startsWith('d')
          ? 'd'
          : normalizedSuit.startsWith('c')
            ? 'c'
            : normalizedSuit.startsWith('s')
              ? 's'
              : normalizedSuit.charAt(0);
      return `${rank}${suitChar}`;
    }
  }
  return null;
}

export function normalizeHand(
  raw: UnknownRecord | null | undefined,
  config: TableConfig,
): HandState | null {
  if (!raw) {
    return null;
  }

  const community = (raw.communityCards ?? raw.community_cards ?? []) as unknown[];
  const communityCards = community
    .map((card) => cardToString(card))
    .filter((card): card is string => Boolean(card));
  const pots = ((raw.pots ?? []) as UnknownRecord[]).map((pot) => ({
    amount: toNumber(pot.amount, 0),
    eligibleSeatIds: normalizeNumberArray(pot.eligibleSeatIds ?? pot.eligible_seat_ids),
  }));

  return {
    handId: String(raw.handId ?? raw.hand_id ?? ''),
    currentStreet: String(raw.currentStreet ?? raw.street ?? 'Lobby'),
    currentTurnSeat: toNumber(raw.currentTurnSeat ?? raw.turn, 0),
    currentBet: toNumber(raw.currentBet ?? raw.current_bet, 0),
    minRaise: toNumber(raw.minRaise ?? raw.min_raise, 0),
    raiseCapped: Boolean(raw.raiseCapped ?? raw.raise_capped ?? false),
    roundContributions: (raw.roundContributions ?? raw.round_contributions ?? {}) as Record<
      number,
      number
    >,
    actedSeats: normalizeNumberArray(raw.actedSeats ?? raw.acted_seats),
    communityCards,
    pots,
    actionTimerDeadline: (raw.actionTimerDeadline ?? raw.action_timer_deadline ?? null) as
      | string
      | null,
    bigBlind: toNumber(raw.bigBlind ?? raw.big_blind ?? config.bigBlind, config.bigBlind),
  };
}

export function normalizeTableState(raw: UnknownRecord, fallback?: TableSummary): TableState {
  const config = normalizeConfig(
    (raw.config ?? fallback?.config ?? {}) as UnknownRecord,
    fallback?.config,
  );
  const seats = Array.isArray(raw.seats) ? (raw.seats as UnknownRecord[]).map(normalizeSeat) : [];
  const spectators = Array.isArray(raw.spectators)
    ? (raw.spectators as UnknownRecord[]).map(normalizeSpectatorView)
    : [];

  return {
    tableId: String(raw.tableId ?? raw.table_id ?? fallback?.tableId ?? ''),
    name: String(raw.name ?? fallback?.name ?? 'Table'),
    ownerId: String(raw.ownerId ?? raw.owner_id ?? fallback?.ownerId ?? ''),
    config,
    seats,
    spectators,
    status: String(raw.status ?? (raw.hand ? 'in_hand' : 'lobby')),
    hand: normalizeHand(raw.hand as UnknownRecord | null | undefined, config),
    button: toNumber(raw.button, 0),
    version: toNumber(raw.version, 0),
  };
}
