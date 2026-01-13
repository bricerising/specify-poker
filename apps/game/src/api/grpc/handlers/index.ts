import { sendUnaryData, ServerUnaryCall } from "@grpc/grpc-js";
import { tableService } from "../../../services/tableService";
import { moderationService } from "../../../services/moderationService";
import {
  Action,
  ActionInput,
  Card,
  HandState,
  Seat,
  Spectator,
  Table,
  TableConfig,
  TableState,
} from "../../../domain/types";

type Empty = Record<string, never>;
type Timestamp = { seconds: number; nanos: number };
type ProtoTableConfig = {
  small_blind: number;
  big_blind: number;
  ante: number;
  max_players: number;
  starting_stack: number;
  turn_timer_seconds: number;
};
type ProtoTable = {
  table_id: string;
  name: string;
  owner_id: string;
  config: ProtoTableConfig;
  status: string;
  created_at: Timestamp;
};
type ProtoSeat = { seat_id: number; user_id?: string; stack: number; status: string };
type ProtoSpectator = { user_id: string; status: string; joined_at: Timestamp };
type ProtoCard = { rank: string; suit: string };
type ProtoAction = {
  action_id: string;
  hand_id: string;
  seat_id: number;
  user_id: string;
  type: string;
  amount: number;
  timestamp: Timestamp;
};
type ProtoPot = { amount: number; eligible_seat_ids: number[]; winners: number[] };
type ProtoHandState = {
  hand_id: string;
  table_id: string;
  street: string;
  community_cards: ProtoCard[];
  pots: ProtoPot[];
  current_bet: number;
  min_raise: number;
  turn: number;
  last_aggressor: number;
  actions: ProtoAction[];
  rake_amount: number;
  started_at: Timestamp;
};
type ProtoTableState = {
  table_id: string;
  seats: ProtoSeat[];
  spectators: ProtoSpectator[];
  hand: ProtoHandState | null;
  button: number;
  version: number;
  updated_at: Timestamp;
};
type ProtoTableSummary = {
  table_id: string;
  name: string;
  owner_id: string;
  config: ProtoTableConfig;
  seats_taken: number;
  occupied_seat_ids: number[];
  in_progress: boolean;
  spectator_count: number;
};
type ListTablesResponse = { tables: ProtoTableSummary[] };

type CreateTableRequest = {
  name: string;
  owner_id: string;
  config: {
    small_blind: number;
    big_blind: number;
    ante?: number;
    max_players: number;
    starting_stack: number;
    turn_timer_seconds?: number;
  };
};

type GetTableRequest = { table_id: string };
type ListTablesRequest = Empty;
type DeleteTableRequest = { table_id: string };

type JoinSeatRequest = { table_id: string; user_id: string; seat_id: number; buy_in_amount: number };
type LeaveSeatRequest = { table_id: string; user_id: string };
type GetTableStateRequest = { table_id: string; user_id?: string };
type JoinSpectatorRequest = { table_id: string; user_id: string };
type LeaveSpectatorRequest = { table_id: string; user_id: string };
type SubmitActionRequest = { table_id: string; user_id: string; action_type: string; amount?: number };
type ActionResult = { ok: boolean; error?: string };
type GetTableStateResponse = { state: ProtoTableState; hole_cards: ProtoCard[] };

type KickPlayerRequest = { table_id: string; owner_id: string; target_user_id: string };
type MutePlayerRequest = { table_id: string; owner_id: string; target_user_id: string };
type UnmutePlayerRequest = { table_id: string; owner_id: string; target_user_id: string };
type IsMutedRequest = { table_id: string; user_id: string };

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toTimestamp(value: string) {
  const date = new Date(value);
  const seconds = Math.floor(date.getTime() / 1000);
  const nanos = (date.getTime() % 1000) * 1_000_000;
  return { seconds, nanos };
}

function toProtoConfig(config: TableConfig) {
  return {
    small_blind: config.smallBlind,
    big_blind: config.bigBlind,
    ante: config.ante ?? 0,
    max_players: config.maxPlayers,
    starting_stack: config.startingStack,
    turn_timer_seconds: config.turnTimerSeconds,
  };
}

function toProtoTable(table: Table) {
  return {
    table_id: table.tableId,
    name: table.name,
    owner_id: table.ownerId,
    config: toProtoConfig(table.config),
    status: table.status,
    created_at: toTimestamp(table.createdAt),
  };
}

function toProtoSeat(seat: Seat) {
  return {
    seat_id: seat.seatId,
    user_id: seat.userId ?? undefined,
    stack: seat.stack,
    status: seat.status,
  };
}

function toProtoSpectator(spectator: Spectator) {
  return {
    user_id: spectator.userId,
    status: spectator.status,
    joined_at: toTimestamp(spectator.joinedAt),
  };
}

function toProtoCard(card: Card) {
  return {
    rank: card.rank,
    suit: card.suit,
  };
}

function toProtoAction(action: Action) {
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

function toProtoPot(pot: HandState["pots"][number]) {
  return {
    amount: pot.amount,
    eligible_seat_ids: pot.eligibleSeats,
    winners: pot.winners ?? [],
  };
}

function toProtoHand(hand: HandState) {
  return {
    hand_id: hand.handId,
    table_id: hand.tableId,
    street: hand.street,
    community_cards: hand.communityCards.map(toProtoCard),
    pots: hand.pots.map(toProtoPot),
    current_bet: hand.currentBet,
    min_raise: hand.minRaise,
    turn: hand.turn,
    last_aggressor: hand.lastAggressor,
    actions: hand.actions.map(toProtoAction),
    rake_amount: hand.rakeAmount,
    started_at: toTimestamp(hand.startedAt),
  };
}

function toProtoState(state: TableState) {
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

export function createHandlers() {
  return {
    CreateTable: async (
      call: ServerUnaryCall<CreateTableRequest, ProtoTable>,
      callback: sendUnaryData<ProtoTable>,
    ) => {
      try {
        const { name, owner_id, config } = call.request;
        const table = await tableService.createTable(name, owner_id, {
          smallBlind: toNumber(config.small_blind, 1),
          bigBlind: toNumber(config.big_blind, 2),
          ante: toNumber(config.ante ?? 0, 0),
          maxPlayers: toNumber(config.max_players, 6),
          startingStack: toNumber(config.starting_stack, 200),
          turnTimerSeconds: toNumber(config.turn_timer_seconds ?? 20, 20),
        });
        callback(null, toProtoTable(table));
      } catch (err) {
        callback(err as Error);
      }
    },

    GetTable: async (
      call: ServerUnaryCall<GetTableRequest, ProtoTable>,
      callback: sendUnaryData<ProtoTable>,
    ) => {
      try {
        const table = await tableService.getTable(call.request.table_id);
        if (!table) {
          callback(new Error("TABLE_NOT_FOUND"));
          return;
        }
        callback(null, toProtoTable(table));
      } catch (err) {
        callback(err as Error);
      }
    },

    ListTables: async (
      _call: ServerUnaryCall<ListTablesRequest, ListTablesResponse>,
      callback: sendUnaryData<ListTablesResponse>,
    ) => {
      try {
        await tableService.ensureMainTable();
        const tables = await tableService.listTableSummaries();
        callback(null, {
          tables: tables.map((summary) => ({
            table_id: summary.tableId,
            name: summary.name,
            owner_id: summary.ownerId,
            config: toProtoConfig(summary.config),
            seats_taken: summary.seatsTaken,
            occupied_seat_ids: summary.occupiedSeatIds,
            in_progress: summary.inProgress,
            spectator_count: summary.spectatorCount,
          })),
        });
      } catch (err) {
        callback(err as Error);
      }
    },

    DeleteTable: async (call: ServerUnaryCall<DeleteTableRequest, Empty>, callback: sendUnaryData<Empty>) => {
      try {
        const deleted = await tableService.deleteTable(call.request.table_id);
        if (!deleted) {
          callback(new Error("TABLE_NOT_FOUND"));
          return;
        }
        callback(null, {});
      } catch (err) {
        callback(err as Error);
      }
    },

    GetTableState: async (
      call: ServerUnaryCall<GetTableStateRequest, GetTableStateResponse>,
      callback: sendUnaryData<GetTableStateResponse>,
    ) => {
      try {
        const { table_id, user_id } = call.request;
        const result = await tableService.getTableState(table_id, user_id);
        if (!result) {
          callback(new Error("TABLE_NOT_FOUND"));
          return;
        }
        callback(null, {
          state: toProtoState(result.state),
          hole_cards: result.holeCards.map(toProtoCard),
        });
      } catch (err) {
        callback(err as Error);
      }
    },

    JoinSeat: async (call: ServerUnaryCall<JoinSeatRequest, ActionResult>, callback: sendUnaryData<ActionResult>) => {
      try {
        const { table_id, user_id, seat_id, buy_in_amount } = call.request;
        const buyInAmount = toNumber(buy_in_amount, 0);
        const result = await tableService.joinSeat(table_id, user_id, seat_id, buyInAmount);
        callback(null, result);
      } catch (err) {
        callback(err as Error);
      }
    },

    LeaveSeat: async (call: ServerUnaryCall<LeaveSeatRequest, ActionResult>, callback: sendUnaryData<ActionResult>) => {
      try {
        const { table_id, user_id } = call.request;
        const result = await tableService.leaveSeat(table_id, user_id);
        callback(null, result);
      } catch (err) {
        callback(err as Error);
      }
    },

    JoinSpectator: async (
      call: ServerUnaryCall<JoinSpectatorRequest, ActionResult>,
      callback: sendUnaryData<ActionResult>,
    ) => {
      try {
        const { table_id, user_id } = call.request;
        const result = await tableService.joinSpectator(table_id, user_id);
        callback(null, result);
      } catch (err) {
        callback(err as Error);
      }
    },

    LeaveSpectator: async (
      call: ServerUnaryCall<LeaveSpectatorRequest, ActionResult>,
      callback: sendUnaryData<ActionResult>,
    ) => {
      try {
        const { table_id, user_id } = call.request;
        const result = await tableService.leaveSpectator(table_id, user_id);
        callback(null, result);
      } catch (err) {
        callback(err as Error);
      }
    },

    SubmitAction: async (
      call: ServerUnaryCall<SubmitActionRequest, ActionResult>,
      callback: sendUnaryData<ActionResult>,
    ) => {
      try {
        const { table_id, user_id, action_type, amount } = call.request;
        const normalizedAction = action_type.toUpperCase() as ActionInput["type"];
        const result = await tableService.submitAction(table_id, user_id, {
          type: normalizedAction,
          amount: amount === undefined ? undefined : toNumber(amount, 0),
        });
        callback(null, result);
      } catch (err) {
        callback(err as Error);
      }
    },

    KickPlayer: async (call: ServerUnaryCall<KickPlayerRequest, Empty>, callback: sendUnaryData<Empty>) => {
      try {
        const { table_id, owner_id, target_user_id } = call.request;
        const result = await moderationService.kickPlayer(table_id, owner_id, target_user_id);
        if (!result.ok) {
          callback(new Error(result.error || "KICK_FAILED"));
          return;
        }
        callback(null, {});
      } catch (err) {
        callback(err as Error);
      }
    },

    MutePlayer: async (call: ServerUnaryCall<MutePlayerRequest, Empty>, callback: sendUnaryData<Empty>) => {
      try {
        const { table_id, owner_id, target_user_id } = call.request;
        const result = await moderationService.mutePlayer(table_id, owner_id, target_user_id, true);
        if (!result.ok) {
          callback(new Error(result.error || "MUTE_FAILED"));
          return;
        }
        callback(null, {});
      } catch (err) {
        callback(err as Error);
      }
    },

    UnmutePlayer: async (call: ServerUnaryCall<UnmutePlayerRequest, Empty>, callback: sendUnaryData<Empty>) => {
      try {
        const { table_id, owner_id, target_user_id } = call.request;
        const result = await moderationService.mutePlayer(table_id, owner_id, target_user_id, false);
        if (!result.ok) {
          callback(new Error(result.error || "UNMUTE_FAILED"));
          return;
        }
        callback(null, {});
      } catch (err) {
        callback(err as Error);
      }
    },

    IsMuted: async (call: ServerUnaryCall<IsMutedRequest, { is_muted: boolean }>, callback: sendUnaryData<{ is_muted: boolean }>) => {
      try {
        const { table_id, user_id } = call.request;
        const is_muted = await moderationService.isMuted(table_id, user_id);
        callback(null, { is_muted });
      } catch (err) {
        callback(err as Error);
      }
    },
  };
}
