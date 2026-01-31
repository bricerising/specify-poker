import type {
  Action,
  Card,
  HandState,
  Seat,
  Spectator,
  Table,
  TableConfig,
  TableState,
} from '../../../domain/types';

export type Timestamp = { seconds: number; nanos: number };

export type ProtoTableConfig = {
  small_blind: number;
  big_blind: number;
  ante: number;
  max_players: number;
  starting_stack: number;
  turn_timer_seconds: number;
};

export type ProtoTable = {
  table_id: string;
  name: string;
  owner_id: string;
  config: ProtoTableConfig;
  status: string;
  created_at: Timestamp;
};

export type ProtoSeat = { seat_id: number; user_id?: string; stack: number; status: string };
export type ProtoSpectator = { user_id: string; status: string; joined_at: Timestamp };
export type ProtoCard = { rank: string; suit: string };

export type ProtoAction = {
  action_id: string;
  hand_id: string;
  seat_id: number;
  user_id: string;
  type: string;
  amount: number;
  timestamp: Timestamp;
};

export type ProtoPot = { amount: number; eligible_seat_ids: number[]; winners: number[] };

export type ProtoHandState = {
  hand_id: string;
  table_id: string;
  street: string;
  community_cards: ProtoCard[];
  pots: ProtoPot[];
  current_bet: number;
  min_raise: number;
  round_contributions: Record<number, number>;
  acted_seats: number[];
  raise_capped: boolean;
  big_blind: number;
  turn: number;
  last_aggressor: number;
  actions: ProtoAction[];
  rake_amount: number;
  started_at: Timestamp;
};

export type ProtoTableState = {
  table_id: string;
  seats: ProtoSeat[];
  spectators: ProtoSpectator[];
  hand: ProtoHandState | null;
  button: number;
  version: number;
  updated_at: Timestamp;
};

export type ProtoTableSummary = {
  table_id: string;
  name: string;
  owner_id: string;
  config: ProtoTableConfig;
  seats_taken: number;
  occupied_seat_ids: number[];
  in_progress: boolean;
  spectator_count: number;
};

function toTimestamp(value: string): Timestamp {
  const date = new Date(value);
  const seconds = Math.floor(date.getTime() / 1000);
  const nanos = (date.getTime() % 1000) * 1_000_000;
  return { seconds, nanos };
}

export function toProtoConfig(config: TableConfig): ProtoTableConfig {
  return {
    small_blind: config.smallBlind,
    big_blind: config.bigBlind,
    ante: config.ante ?? 0,
    max_players: config.maxPlayers,
    starting_stack: config.startingStack,
    turn_timer_seconds: config.turnTimerSeconds,
  };
}

export function toProtoTable(table: Table): ProtoTable {
  return {
    table_id: table.tableId,
    name: table.name,
    owner_id: table.ownerId,
    config: toProtoConfig(table.config),
    status: table.status,
    created_at: toTimestamp(table.createdAt),
  };
}

function toProtoSeat(seat: Seat): ProtoSeat {
  return {
    seat_id: seat.seatId,
    user_id: seat.userId ?? undefined,
    stack: seat.stack,
    status: seat.status,
  };
}

function toProtoSpectator(spectator: Spectator): ProtoSpectator {
  return {
    user_id: spectator.userId,
    status: spectator.status,
    joined_at: toTimestamp(spectator.joinedAt),
  };
}

export function toProtoCard(card: Card): ProtoCard {
  return {
    rank: card.rank,
    suit: card.suit,
  };
}

function toProtoAction(action: Action): ProtoAction {
  return {
    action_id: action.actionId,
    hand_id: action.handId,
    seat_id: action.seatId,
    user_id: action.userId,
    type: action.type,
    amount: action.amount,
    timestamp: toTimestamp(action.timestamp),
  };
}

function toProtoPot(pot: HandState['pots'][number]): ProtoPot {
  return {
    amount: pot.amount,
    eligible_seat_ids: pot.eligibleSeats,
    winners: pot.winners ?? [],
  };
}

function toProtoHand(hand: HandState): ProtoHandState {
  return {
    hand_id: hand.handId,
    table_id: hand.tableId,
    street: hand.street,
    community_cards: hand.communityCards.map(toProtoCard),
    pots: hand.pots.map(toProtoPot),
    current_bet: hand.currentBet,
    min_raise: hand.minRaise,
    round_contributions: hand.roundContributions,
    acted_seats: hand.actedSeats,
    raise_capped: hand.raiseCapped,
    big_blind: hand.bigBlind,
    turn: hand.turn,
    last_aggressor: hand.lastAggressor,
    actions: hand.actions.map(toProtoAction),
    rake_amount: hand.rakeAmount,
    started_at: toTimestamp(hand.startedAt),
  };
}

export function toProtoState(state: TableState): ProtoTableState {
  return {
    table_id: state.tableId,
    seats: state.seats.map(toProtoSeat),
    spectators: state.spectators.map(toProtoSpectator),
    hand: state.hand ? toProtoHand(state.hand) : null,
    button: state.button,
    version: state.version,
    updated_at: toTimestamp(state.updatedAt),
  };
}
