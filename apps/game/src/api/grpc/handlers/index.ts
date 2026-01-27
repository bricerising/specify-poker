import { sendUnaryData, ServerUnaryCall, ServiceError } from "@grpc/grpc-js";
import { createUnaryHandler, withUnaryErrorHandling, withUnaryTiming } from "@specify-poker/shared";
import { tableService } from "../../../services/tableService";
import { moderationService } from "../../../services/moderationService";
import { recordGrpcRequest } from "../../../observability/metrics";
import { coerceNumber } from "../../../utils/coerce";
import { toServiceError } from "./grpcError";
import { toProtoCard, toProtoConfig, toProtoState, toProtoTable } from "./proto";
import type { ProtoCard, ProtoTableState, ProtoTableSummary } from "./proto";
import type { ActionInput } from "../../../domain/types";

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

function createGameUnaryHandler<Req, Res>(
  method: string,
  handler: (request: Req) => Promise<Res> | Res
): (call: ServerUnaryCall<Req, Res>, callback: sendUnaryData<Res>) => Promise<void> {
  return createUnaryHandler<Req, Res, ServerUnaryCall<Req, Res>, ServiceError>({
    handler: ({ request }) => handler(request),
    interceptors: [
      withUnaryTiming({ method, record: recordGrpcRequest }),
      withUnaryErrorHandling({ method, toServiceError }),
    ],
  });
}

export function createHandlers() {
  return {
    CreateTable: createGameUnaryHandler("CreateTable", async ({ name, owner_id, config }: CreateTableRequest) => {
      const table = await tableService.createTable(name, owner_id, {
        smallBlind: coerceNumber(config.small_blind, 1),
        bigBlind: coerceNumber(config.big_blind, 2),
        ante: coerceNumber(config.ante ?? 0, 0),
        maxPlayers: coerceNumber(config.max_players, 6),
        startingStack: coerceNumber(config.starting_stack, 200),
        turnTimerSeconds: coerceNumber(config.turn_timer_seconds ?? 20, 20),
      });
      return toProtoTable(table);
    }),

    GetTable: createGameUnaryHandler("GetTable", async ({ table_id }: GetTableRequest) => {
      const table = await tableService.getTable(table_id);
      if (!table) {
        throw new Error("TABLE_NOT_FOUND");
      }
      return toProtoTable(table);
    }),

    ListTables: createGameUnaryHandler<ListTablesRequest, ListTablesResponse>("ListTables", async (_request) => {
      await tableService.ensureMainTable();
      const tables = await tableService.listTableSummaries();
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
    }),

    DeleteTable: createGameUnaryHandler("DeleteTable", async ({ table_id }: DeleteTableRequest) => {
      const deleted = await tableService.deleteTable(table_id);
      if (!deleted) {
        throw new Error("TABLE_NOT_FOUND");
      }
      return {};
    }),

    GetTableState: createGameUnaryHandler<GetTableStateRequest, GetTableStateResponse>(
      "GetTableState",
      async ({ table_id, user_id }) => {
        const result = await tableService.getTableState(table_id, user_id);
        if (!result) {
          throw new Error("TABLE_NOT_FOUND");
        }
        return {
          state: toProtoState(result.state),
          hole_cards: result.holeCards.map(toProtoCard),
        };
      },
    ),

    JoinSeat: createGameUnaryHandler("JoinSeat", ({ table_id, user_id, seat_id, buy_in_amount }: JoinSeatRequest) => {
      const buyInAmount = coerceNumber(buy_in_amount, 0);
      return tableService.joinSeat(table_id, user_id, seat_id, buyInAmount);
    }),

    LeaveSeat: createGameUnaryHandler("LeaveSeat", ({ table_id, user_id }: LeaveSeatRequest) =>
      tableService.leaveSeat(table_id, user_id)
    ),

    JoinSpectator: createGameUnaryHandler("JoinSpectator", ({ table_id, user_id }: JoinSpectatorRequest) =>
      tableService.joinSpectator(table_id, user_id)
    ),

    LeaveSpectator: createGameUnaryHandler("LeaveSpectator", ({ table_id, user_id }: LeaveSpectatorRequest) =>
      tableService.leaveSpectator(table_id, user_id)
    ),

    SubmitAction: createGameUnaryHandler<SubmitActionRequest, ActionResult>(
      "SubmitAction",
      ({ table_id, user_id, action_type, amount }) => {
        const normalizedAction = action_type.toUpperCase() as ActionInput["type"];
        return tableService.submitAction(table_id, user_id, {
          type: normalizedAction,
          amount: amount === undefined ? undefined : coerceNumber(amount, 0),
        });
      },
    ),

    KickPlayer: createGameUnaryHandler("KickPlayer", async ({ table_id, owner_id, target_user_id }: KickPlayerRequest) => {
      const result = await moderationService.kickPlayer(table_id, owner_id, target_user_id);
      if (!result.ok) {
        throw new Error(result.error || "KICK_FAILED");
      }
      return {};
    }),

    MutePlayer: createGameUnaryHandler("MutePlayer", async ({ table_id, owner_id, target_user_id }: MutePlayerRequest) => {
      const result = await moderationService.mutePlayer(table_id, owner_id, target_user_id, true);
      if (!result.ok) {
        throw new Error(result.error || "MUTE_FAILED");
      }
      return {};
    }),

    UnmutePlayer: createGameUnaryHandler(
      "UnmutePlayer",
      async ({ table_id, owner_id, target_user_id }: UnmutePlayerRequest) => {
        const result = await moderationService.mutePlayer(table_id, owner_id, target_user_id, false);
        if (!result.ok) {
          throw new Error(result.error || "UNMUTE_FAILED");
        }
        return {};
      },
    ),

    IsMuted: createGameUnaryHandler("IsMuted", async ({ table_id, user_id }: IsMutedRequest) => {
      const is_muted = await moderationService.isMuted(table_id, user_id);
      return { is_muted };
    }),
  };
}
