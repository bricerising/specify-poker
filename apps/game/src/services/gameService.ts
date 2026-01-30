import type { ActionInput, Card, Table, TableConfig, TableSummary, TableState } from '../domain/types';
import type { ModerationService } from './moderationService';
import { moderationService as defaultModerationService } from './moderationService';
import type { TableService } from './tableService';
import { tableService as defaultTableService } from './tableService';

export type OkResult = { ok: true };
export type ErrorResult = { ok: false; error: string };
export type ServiceResult = OkResult | ErrorResult;
export type JoinSeatResult = OkResult | ErrorResult;

export type GetTableStateResult = {
  state: TableState;
  holeCards: Card[];
};

export type GameService = {
  createTable(name: string, ownerId: string, config: TableConfig): Promise<Table>;
  ensureMainTable(): Promise<void>;
  getTable(tableId: string): Promise<Table | null>;
  listTableSummaries(): Promise<TableSummary[]>;
  deleteTable(tableId: string): Promise<boolean>;
  getTableState(tableId: string, userId?: string): Promise<GetTableStateResult | null>;
  joinSeat(
    tableId: string,
    userId: string,
    seatId: number,
    buyInAmount: number,
  ): Promise<JoinSeatResult>;
  leaveSeat(tableId: string, userId: string): Promise<ServiceResult>;
  joinSpectator(tableId: string, userId: string): Promise<ServiceResult>;
  leaveSpectator(tableId: string, userId: string): Promise<ServiceResult>;
  submitAction(tableId: string, userId: string, action: ActionInput): Promise<ServiceResult>;
  shutdown(): void;
  kickPlayer(tableId: string, ownerId: string, targetUserId: string): Promise<ServiceResult>;
  mutePlayer(
    tableId: string,
    ownerId: string,
    targetUserId: string,
    muted: boolean,
  ): Promise<ServiceResult>;
  isMuted(tableId: string, userId: string): Promise<boolean>;
};

export type GameServiceDeps = {
  tableService: Pick<
    TableService,
    | 'createTable'
    | 'ensureMainTable'
    | 'getTable'
    | 'listTableSummaries'
    | 'deleteTable'
    | 'getTableState'
    | 'joinSeat'
    | 'leaveSeat'
    | 'joinSpectator'
    | 'leaveSpectator'
    | 'submitAction'
    | 'shutdown'
  >;
  moderationService: Pick<ModerationService, 'kickPlayer' | 'mutePlayer' | 'isMuted'>;
};

export function createGameService(deps: GameServiceDeps): GameService {
  return {
    createTable: (name, ownerId, config) => deps.tableService.createTable(name, ownerId, config),
    ensureMainTable: () => deps.tableService.ensureMainTable(),
    getTable: (tableId) => deps.tableService.getTable(tableId),
    listTableSummaries: () => deps.tableService.listTableSummaries(),
    deleteTable: (tableId) => deps.tableService.deleteTable(tableId),
    getTableState: (tableId, userId) => deps.tableService.getTableState(tableId, userId),
    joinSeat: (tableId, userId, seatId, buyInAmount) =>
      deps.tableService.joinSeat(tableId, userId, seatId, buyInAmount),
    leaveSeat: (tableId, userId) => deps.tableService.leaveSeat(tableId, userId),
    joinSpectator: (tableId, userId) => deps.tableService.joinSpectator(tableId, userId),
    leaveSpectator: (tableId, userId) => deps.tableService.leaveSpectator(tableId, userId),
    submitAction: (tableId, userId, action) =>
      deps.tableService.submitAction(tableId, userId, action),
    shutdown: () => deps.tableService.shutdown(),
    kickPlayer: (tableId, ownerId, targetUserId) =>
      deps.moderationService.kickPlayer(tableId, ownerId, targetUserId),
    mutePlayer: (tableId, ownerId, targetUserId, muted) =>
      deps.moderationService.mutePlayer(tableId, ownerId, targetUserId, muted),
    isMuted: (tableId, userId) => deps.moderationService.isMuted(tableId, userId),
  };
}

export const gameService = createGameService({
  tableService: defaultTableService,
  moderationService: defaultModerationService,
});
