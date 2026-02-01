import type { GameService } from '../../../services/gameService';
import { parseActionInput } from '../../../domain/actionInput';
import { coerceNumber } from '../../../utils/coerce';
import { toProtoCard, toProtoConfig, toProtoState, toProtoTable } from './proto';
import type { ProtoCard, ProtoTable, ProtoTableState, ProtoTableSummary } from './proto';
import redisClient from '../../../storage/redisClient';
import { runRedisIdempotent } from '@specify-poker/shared/redis';

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
  idempotency_key: string;
};

type GetTableRequest = { table_id: string };
type ListTablesRequest = Empty;
type DeleteTableRequest = { table_id: string; idempotency_key: string };

type JoinSeatRequest = {
  table_id: string;
  user_id: string;
  seat_id: number;
  buy_in_amount: number;
  idempotency_key: string;
};
type LeaveSeatRequest = { table_id: string; user_id: string; idempotency_key: string };
type GetTableStateRequest = { table_id: string; user_id?: string };
type JoinSpectatorRequest = { table_id: string; user_id: string; idempotency_key: string };
type LeaveSpectatorRequest = { table_id: string; user_id: string; idempotency_key: string };
type SubmitActionRequest = {
  table_id: string;
  user_id: string;
  action_type: string;
  amount?: number;
  idempotency_key: string;
};
type ActionResult = { ok: boolean; error?: string };
type GetTableStateResponse = { state: ProtoTableState; hole_cards: ProtoCard[] };

type KickPlayerRequest = { table_id: string; owner_id: string; target_user_id: string; idempotency_key: string };
type MutePlayerRequest = { table_id: string; owner_id: string; target_user_id: string; idempotency_key: string };
type UnmutePlayerRequest = { table_id: string; owner_id: string; target_user_id: string; idempotency_key: string };
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

function requireIdempotencyKey(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key) {
    throw new Error('MISSING_IDEMPOTENCY_KEY');
  }
  return key;
}

async function runIdempotent<T>(options: {
  method: string;
  idempotencyKey: string;
  isSuccess: (value: T) => boolean;
  ttlMs: number;
  operation: () => Promise<T>;
}): Promise<T> {
  const result = await runRedisIdempotent({
    redis: redisClient,
    redisKey: `idempotency:game:${options.method}:${options.idempotencyKey}`,
    idempotencyKey: options.idempotencyKey,
    ttlMs: options.ttlMs,
    isSuccess: options.isSuccess,
    operation: options.operation,
  });
  return result.value;
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
    CreateTable: async ({ name, owner_id, config, idempotency_key }: CreateTableRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);

      return runIdempotent({
        method: 'CreateTable',
        idempotencyKey,
        ttlMs: 3_600_000,
        isSuccess: () => true,
        operation: async () => {
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
      });
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

    DeleteTable: async ({ table_id, idempotency_key }: DeleteTableRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);

      return runIdempotent({
        method: 'DeleteTable',
        idempotencyKey,
        ttlMs: 3_600_000,
        isSuccess: () => true,
        operation: async () => {
          const deleted = await gameService.deleteTable(table_id);
          if (!deleted) {
            throw new Error('TABLE_NOT_FOUND');
          }
          return {};
        },
      });
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

    JoinSeat: async ({ table_id, user_id, seat_id, buy_in_amount, idempotency_key }: JoinSeatRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);
      const buyInAmount = coerceNumber(buy_in_amount, 0);

      return runIdempotent({
        method: 'JoinSeat',
        idempotencyKey,
        ttlMs: 10 * 60_000,
        isSuccess: (result) => result.ok,
        operation: async () => gameService.joinSeat(table_id, user_id, seat_id, buyInAmount),
      });
    },

    LeaveSeat: async ({ table_id, user_id, idempotency_key }: LeaveSeatRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);

      return runIdempotent({
        method: 'LeaveSeat',
        idempotencyKey,
        ttlMs: 10 * 60_000,
        isSuccess: (result) => result.ok,
        operation: async () => gameService.leaveSeat(table_id, user_id),
      });
    },

    JoinSpectator: async ({ table_id, user_id, idempotency_key }: JoinSpectatorRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);

      return runIdempotent({
        method: 'JoinSpectator',
        idempotencyKey,
        ttlMs: 60_000,
        isSuccess: (result) => result.ok,
        operation: async () => gameService.joinSpectator(table_id, user_id),
      });
    },

    LeaveSpectator: async ({ table_id, user_id, idempotency_key }: LeaveSpectatorRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);

      return runIdempotent({
        method: 'LeaveSpectator',
        idempotencyKey,
        ttlMs: 60_000,
        isSuccess: (result) => result.ok,
        operation: async () => gameService.leaveSpectator(table_id, user_id),
      });
    },

    SubmitAction: async ({ table_id, user_id, action_type, amount, idempotency_key }: SubmitActionRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);

      const parsed = parseActionInput({ actionType: action_type, amount });
      if (!parsed.ok) {
        return { ok: false, error: parsed.error.type };
      }

      return runIdempotent({
        method: 'SubmitAction',
        idempotencyKey,
        ttlMs: 5 * 60_000,
        isSuccess: (result) => result.ok,
        operation: async () => gameService.submitAction(table_id, user_id, parsed.value),
      });
    },

    KickPlayer: async ({ table_id, owner_id, target_user_id, idempotency_key }: KickPlayerRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);

      return runIdempotent({
        method: 'KickPlayer',
        idempotencyKey,
        ttlMs: 60_000,
        isSuccess: () => true,
        operation: async () => {
          assertOk(await gameService.kickPlayer(table_id, owner_id, target_user_id), 'KICK_FAILED');
          return {};
        },
      });
    },

    MutePlayer: async ({ table_id, owner_id, target_user_id, idempotency_key }: MutePlayerRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);

      return runIdempotent({
        method: 'MutePlayer',
        idempotencyKey,
        ttlMs: 60_000,
        isSuccess: () => true,
        operation: async () => {
          assertOk(
            await gameService.mutePlayer(table_id, owner_id, target_user_id, true),
            'MUTE_FAILED',
          );
          return {};
        },
      });
    },

    UnmutePlayer: async ({ table_id, owner_id, target_user_id, idempotency_key }: UnmutePlayerRequest) => {
      const idempotencyKey = requireIdempotencyKey(idempotency_key);

      return runIdempotent({
        method: 'UnmutePlayer',
        idempotencyKey,
        ttlMs: 60_000,
        isSuccess: () => true,
        operation: async () => {
          assertOk(
            await gameService.mutePlayer(table_id, owner_id, target_user_id, false),
            'UNMUTE_FAILED',
          );
          return {};
        },
      });
    },

    IsMuted: async ({ table_id, user_id }: IsMutedRequest) => {
      const is_muted = await gameService.isMuted(table_id, user_id);
      return { is_muted };
    },
  };
}
