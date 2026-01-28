type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function timestampToIso(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!isRecord(value)) {
    return new Date(0).toISOString();
  }
  const seconds = toNumber(value.seconds, 0);
  const nanos = toNumber(value.nanos, 0);
  const millis = seconds * 1000 + Math.floor(nanos / 1_000_000);
  return new Date(millis).toISOString();
}

export interface WireTableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number | null;
  maxPlayers: number;
  startingStack: number;
  bettingStructure: 'NoLimit';
  turnTimerSeconds?: number;
}

export interface WireTableSummary {
  tableId: string;
  name: string;
  ownerId: string;
  config: WireTableConfig;
  seatsTaken: number;
  occupiedSeatIds: number[];
  inProgress: boolean;
  spectatorCount: number;
}

export interface WireSeatView {
  seatId: number;
  userId: string | null;
  stack: number;
  status: string;
}

export interface WireSpectatorView {
  userId: string;
  status: string;
  joinedAt: string;
}

export interface WireHandActionView {
  actionId: string;
  handId: string;
  seatId: number;
  userId: string;
  type: string;
  amount: number;
  timestamp: string;
}

export interface WirePotView {
  amount: number;
  eligibleSeatIds: number[];
  winners?: number[];
}

export interface WireHandStateView {
  handId: string;
  tableId: string;
  street: string;
  communityCards: unknown[];
  pots: WirePotView[];
  currentBet: number;
  minRaise: number;
  turn: number;
  lastAggressor: number;
  actions: WireHandActionView[];
  rakeAmount: number;
  startedAt: string;
}

export interface WireTableStateView {
  tableId: string;
  name: string;
  ownerId: string;
  config: WireTableConfig;
  status: string;
  hand: WireHandStateView | null;
  version: number;
  seats: WireSeatView[];
  spectators: WireSpectatorView[];
  updatedAt: string;
  button: number;
}

export function toWireTableConfig(value: unknown): WireTableConfig {
  const record = isRecord(value) ? value : {};
  const smallBlind = toNumber(record.small_blind ?? record.smallBlind, 1);
  const bigBlind = toNumber(record.big_blind ?? record.bigBlind, 2);
  const anteRaw = record.ante;
  const ante = anteRaw === undefined || anteRaw === null ? null : toNumber(anteRaw, 0);
  return {
    smallBlind,
    bigBlind,
    ante,
    maxPlayers: toNumber(record.max_players ?? record.maxPlayers, 6),
    startingStack: toNumber(record.starting_stack ?? record.startingStack, 200),
    bettingStructure: 'NoLimit',
    turnTimerSeconds: isRecord(record)
      ? toNumber(record.turn_timer_seconds ?? record.turnTimerSeconds, 20)
      : 20,
  };
}

export function toWireTableSummary(value: unknown): WireTableSummary {
  const record = isRecord(value) ? value : {};
  return {
    tableId: toString(record.table_id ?? record.tableId),
    name: toString(record.name ?? 'Table'),
    ownerId: toString(record.owner_id ?? record.ownerId),
    config: toWireTableConfig(record.config),
    seatsTaken: toNumber(record.seats_taken ?? record.seatsTaken, 0),
    occupiedSeatIds: ((record.occupied_seat_ids ?? record.occupiedSeatIds ?? []) as unknown[]).map(
      (entry) => toNumber(entry, 0),
    ),
    inProgress: Boolean(record.in_progress ?? record.inProgress),
    spectatorCount: toNumber(record.spectator_count ?? record.spectatorCount, 0),
  };
}

export function toWireSeatView(value: unknown): WireSeatView {
  const record = isRecord(value) ? value : {};
  const userRaw = record.user_id ?? record.userId;
  const userId = typeof userRaw === 'string' && userRaw.trim().length > 0 ? userRaw : null;
  return {
    seatId: toNumber(record.seat_id ?? record.seatId, 0),
    userId,
    stack: toNumber(record.stack, 0),
    status: toString(record.status ?? 'EMPTY'),
  };
}

export function toWireSpectatorView(value: unknown): WireSpectatorView {
  const record = isRecord(value) ? value : {};
  return {
    userId: toString(record.user_id ?? record.userId),
    status: toString(record.status ?? 'active'),
    joinedAt: timestampToIso(record.joined_at ?? record.joinedAt),
  };
}

function toWirePotView(value: unknown): WirePotView {
  const record = isRecord(value) ? value : {};
  const winnersRaw = record.winners;
  return {
    amount: toNumber(record.amount, 0),
    eligibleSeatIds: ((record.eligible_seat_ids ?? record.eligibleSeatIds ?? []) as unknown[]).map(
      (entry) => toNumber(entry, 0),
    ),
    ...(Array.isArray(winnersRaw)
      ? { winners: winnersRaw.map((entry) => toNumber(entry, 0)) }
      : {}),
  };
}

function toWireHandActionView(value: unknown): WireHandActionView {
  const record = isRecord(value) ? value : {};
  return {
    actionId: toString(record.action_id ?? record.actionId),
    handId: toString(record.hand_id ?? record.handId),
    seatId: toNumber(record.seat_id ?? record.seatId, 0),
    userId: toString(record.user_id ?? record.userId),
    type: toString(record.type),
    amount: toNumber(record.amount, 0),
    timestamp: timestampToIso(record.timestamp),
  };
}

export function toWireHandStateView(value: unknown): WireHandStateView | null {
  if (!value) {
    return null;
  }
  const record = isRecord(value) ? value : null;
  if (!record) {
    return null;
  }

  const potsRaw = Array.isArray(record.pots) ? record.pots : [];
  const actionsRaw = Array.isArray(record.actions) ? record.actions : [];
  const communityCardsRaw = Array.isArray(record.community_cards ?? record.communityCards)
    ? ((record.community_cards ?? record.communityCards) as unknown[])
    : [];

  return {
    handId: toString(record.hand_id ?? record.handId),
    tableId: toString(record.table_id ?? record.tableId),
    street: toString(record.street ?? 'PREFLOP'),
    communityCards: communityCardsRaw,
    pots: potsRaw.map(toWirePotView),
    currentBet: toNumber(record.current_bet ?? record.currentBet, 0),
    minRaise: toNumber(record.min_raise ?? record.minRaise, 0),
    turn: toNumber(record.turn, 0),
    lastAggressor: toNumber(record.last_aggressor ?? record.lastAggressor, 0),
    actions: actionsRaw.map(toWireHandActionView),
    rakeAmount: toNumber(record.rake_amount ?? record.rakeAmount, 0),
    startedAt: timestampToIso(record.started_at ?? record.startedAt),
  };
}

export function toWireTableStateView(table: unknown, state: unknown): WireTableStateView {
  const tableRecord = isRecord(table) ? table : {};
  const stateRecord = isRecord(state) ? state : {};

  const seatsRaw = Array.isArray(stateRecord.seats) ? stateRecord.seats : [];
  const spectatorsRaw = Array.isArray(stateRecord.spectators) ? stateRecord.spectators : [];

  return {
    tableId:
      toString(tableRecord.table_id ?? tableRecord.tableId) ||
      toString(stateRecord.table_id ?? stateRecord.tableId),
    name: toString(tableRecord.name ?? 'Table'),
    ownerId: toString(tableRecord.owner_id ?? tableRecord.ownerId),
    config: toWireTableConfig(tableRecord.config),
    status: toString(tableRecord.status ?? 'UNKNOWN'),
    hand: toWireHandStateView(stateRecord.hand),
    version: toNumber(stateRecord.version, 0),
    seats: seatsRaw.map(toWireSeatView),
    spectators: spectatorsRaw.map(toWireSpectatorView),
    updatedAt: timestampToIso(stateRecord.updated_at ?? stateRecord.updatedAt),
    button: toNumber(stateRecord.button, 0),
  };
}
