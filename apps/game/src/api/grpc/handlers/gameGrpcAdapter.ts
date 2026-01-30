import type { GameService } from '../../../services/gameService';
import { parseActionInput } from '../../../domain/actionInput';
import { coerceNumber } from '../../../utils/coerce';
import { toProtoCard, toProtoConfig, toProtoState, toProtoTable } from './proto';
import type { ProtoCard, ProtoTable, ProtoTableState, ProtoTableSummary } from './proto';

type Empty = Record<string, never>;
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

type JoinSeatRequest = {
  table_id: string;
  user_id: string;
  seat_id: number;
  buy_in_amount: number;
};
type LeaveSeatRequest = { table_id: string; user_id: string };
type GetTableStateRequest = { table_id: string; user_id?: string };
type JoinSpectatorRequest = { table_id: string; user_id: string };
type LeaveSpectatorRequest = { table_id: string; user_id: string };
type SubmitActionRequest = {
  table_id: string;
  user_id: string;
  action_type: string;
  amount?: number;
};
type ActionResult = { ok: boolean; error?: string };
type GetTableStateResponse = { state: ProtoTableState; hole_cards: ProtoCard[] };

type KickPlayerRequest = { table_id: string; owner_id: string; target_user_id: string };
type MutePlayerRequest = { table_id: string; owner_id: string; target_user_id: string };
type UnmutePlayerRequest = { table_id: string; owner_id: string; target_user_id: string };
type IsMutedRequest = { table_id: string; user_id: string };

function requireFound<T>(value: T | null, message: string): T {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function assertOk(result: { ok: boolean; error?: string }, fallbackMessage: string): void {
  if (result.ok) {
    return;
  }
  throw new Error(result.error || fallbackMessage);
}

export type GameGrpcAdapter = {
  CreateTable(request: CreateTableRequest): Promise<ProtoTable>;
  GetTable(request: GetTableRequest): Promise<ProtoTable>;
  ListTables(request: ListTablesRequest): Promise<ListTablesResponse>;
  DeleteTable(request: DeleteTableRequest): Promise<Empty>;
  GetTableState(request: GetTableStateRequest): Promise<GetTableStateResponse>;
  JoinSeat(request: JoinSeatRequest): Promise<ActionResult>;
  LeaveSeat(request: LeaveSeatRequest): Promise<ActionResult>;
  JoinSpectator(request: JoinSpectatorRequest): Promise<ActionResult>;
  LeaveSpectator(request: LeaveSpectatorRequest): Promise<ActionResult>;
  SubmitAction(request: SubmitActionRequest): Promise<ActionResult>;
  KickPlayer(request: KickPlayerRequest): Promise<Empty>;
  MutePlayer(request: MutePlayerRequest): Promise<Empty>;
  UnmutePlayer(request: UnmutePlayerRequest): Promise<Empty>;
  IsMuted(request: IsMutedRequest): Promise<{ is_muted: boolean }>;
};

export function createGameGrpcAdapter(gameService: GameService): GameGrpcAdapter {
  return {
    CreateTable: async ({ name, owner_id, config }: CreateTableRequest) => {
      const table = await gameService.createTable(name, owner_id, {
        smallBlind: coerceNumber(config.small_blind, 1),
        bigBlind: coerceNumber(config.big_blind, 2),
        ante: coerceNumber(config.ante ?? 0, 0),
        maxPlayers: coerceNumber(config.max_players, 6),
        startingStack: coerceNumber(config.starting_stack, 200),
        turnTimerSeconds: coerceNumber(config.turn_timer_seconds ?? 20, 20),
      });
      return toProtoTable(table);
    },

    GetTable: async ({ table_id }: GetTableRequest) => {
      const table = requireFound(await gameService.getTable(table_id), 'TABLE_NOT_FOUND');
      return toProtoTable(table);
    },

    ListTables: async (_request: ListTablesRequest) => {
      await gameService.ensureMainTable();
      const tables = await gameService.listTableSummaries();
      return {
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
      };
    },

    DeleteTable: async ({ table_id }: DeleteTableRequest) => {
      const deleted = await gameService.deleteTable(table_id);
      if (!deleted) {
        throw new Error('TABLE_NOT_FOUND');
      }
      return {};
    },

    GetTableState: async ({ table_id, user_id }: GetTableStateRequest) => {
      const result = requireFound(
        await gameService.getTableState(table_id, user_id),
        'TABLE_NOT_FOUND',
      );
      return {
        state: toProtoState(result.state),
        hole_cards: result.holeCards.map(toProtoCard),
      };
    },

    JoinSeat: async ({ table_id, user_id, seat_id, buy_in_amount }: JoinSeatRequest) => {
      const buyInAmount = coerceNumber(buy_in_amount, 0);
      return await gameService.joinSeat(table_id, user_id, seat_id, buyInAmount);
    },

    LeaveSeat: async ({ table_id, user_id }: LeaveSeatRequest) => {
      return await gameService.leaveSeat(table_id, user_id);
    },

    JoinSpectator: async ({ table_id, user_id }: JoinSpectatorRequest) => {
      return await gameService.joinSpectator(table_id, user_id);
    },

    LeaveSpectator: async ({ table_id, user_id }: LeaveSpectatorRequest) => {
      return await gameService.leaveSpectator(table_id, user_id);
    },

    SubmitAction: async ({ table_id, user_id, action_type, amount }: SubmitActionRequest) => {
      const parsed = parseActionInput({ actionType: action_type, amount });
      if (!parsed.ok) {
        return { ok: false, error: parsed.error.type };
      }
      return await gameService.submitAction(table_id, user_id, parsed.value);
    },

    KickPlayer: async ({ table_id, owner_id, target_user_id }: KickPlayerRequest) => {
      assertOk(await gameService.kickPlayer(table_id, owner_id, target_user_id), 'KICK_FAILED');
      return {};
    },

    MutePlayer: async ({ table_id, owner_id, target_user_id }: MutePlayerRequest) => {
      assertOk(
        await gameService.mutePlayer(table_id, owner_id, target_user_id, true),
        'MUTE_FAILED',
      );
      return {};
    },

    UnmutePlayer: async ({ table_id, owner_id, target_user_id }: UnmutePlayerRequest) => {
      assertOk(
        await gameService.mutePlayer(table_id, owner_id, target_user_id, false),
        'UNMUTE_FAILED',
      );
      return {};
    },

    IsMuted: async ({ table_id, user_id }: IsMutedRequest) => {
      const is_muted = await gameService.isMuted(table_id, user_id);
      return { is_muted };
    },
  };
}
