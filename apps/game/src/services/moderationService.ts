import type { Table, TableState } from '../domain/types';
import { muteStore } from '../storage/muteStore';
import { tableStateStore } from '../storage/tableStateStore';
import { tableStore } from '../storage/tableStore';
import type { TableService } from './tableService';
import { tableService } from './tableService';

export type ModerationServiceDeps = {
  tableStore: {
    get(tableId: string): Promise<Table | null>;
  };
  tableStateStore: {
    get(tableId: string): Promise<TableState | null>;
  };
  tableService: Pick<TableService, 'leaveSeat'>;
  muteStore: {
    mute(tableId: string, userId: string): Promise<void>;
    unmute(tableId: string, userId: string): Promise<void>;
    isMuted(tableId: string, userId: string): Promise<boolean>;
  };
};

type ServiceResult = { ok: true } | { ok: false; error: string };

export class ModerationService {
  private readonly deps: ModerationServiceDeps;

  constructor(deps: ModerationServiceDeps) {
    this.deps = deps;
  }

  async kickPlayer(
    tableId: string,
    ownerId: string,
    targetUserId: string,
  ): Promise<ServiceResult> {
    const table = await this.deps.tableStore.get(tableId);
    if (!table) return { ok: false, error: 'TABLE_NOT_FOUND' };
    if (table.ownerId !== ownerId) return { ok: false, error: 'NOT_AUTHORIZED' };

    const state = await this.deps.tableStateStore.get(tableId);
    if (!state) return { ok: false, error: 'TABLE_NOT_FOUND' };

    const seat = state.seats.find((entry) => entry.userId === targetUserId);
    if (!seat) return { ok: false, error: 'PLAYER_NOT_AT_TABLE' };

    return await this.deps.tableService.leaveSeat(tableId, targetUserId);
  }

  async mutePlayer(
    tableId: string,
    ownerId: string,
    targetUserId: string,
    muted: boolean,
  ): Promise<ServiceResult> {
    const table = await this.deps.tableStore.get(tableId);
    if (!table) return { ok: false, error: 'TABLE_NOT_FOUND' };
    if (table.ownerId !== ownerId) return { ok: false, error: 'NOT_AUTHORIZED' };

    if (muted) {
      await this.deps.muteStore.mute(tableId, targetUserId);
    } else {
      await this.deps.muteStore.unmute(tableId, targetUserId);
    }

    return { ok: true };
  }

  async isMuted(tableId: string, userId: string): Promise<boolean> {
    return await this.deps.muteStore.isMuted(tableId, userId);
  }
}

export function createModerationService(
  overrides: Partial<ModerationServiceDeps> = {},
): ModerationService {
  return new ModerationService({
    tableStore: overrides.tableStore ?? tableStore,
    tableStateStore: overrides.tableStateStore ?? tableStateStore,
    tableService: overrides.tableService ?? tableService,
    muteStore: overrides.muteStore ?? muteStore,
  });
}

export const moderationService = createModerationService();
