import { tableStore } from "../storage/tableStore";
import { tableService } from "./tableService";
import { muteStore } from "../storage/muteStore";

export class ModerationService {
  async kickPlayer(tableId: string, ownerId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
    const table = await tableStore.get(tableId);
    if (!table) return { ok: false, error: "TABLE_NOT_FOUND" };
    if (table.ownerId !== ownerId) return { ok: false, error: "NOT_AUTHORIZED" };

    const state = await tableService.getTableState(tableId);
    if (!state) return { ok: false, error: "TABLE_NOT_FOUND" };
    const seat = state.state.seats.find((entry) => entry.userId === targetUserId);
    if (!seat) return { ok: false, error: "PLAYER_NOT_AT_TABLE" };

    return await tableService.leaveSeat(tableId, targetUserId);
  }

  async mutePlayer(tableId: string, ownerId: string, targetUserId: string, muted: boolean): Promise<{ ok: boolean; error?: string }> {
    const table = await tableStore.get(tableId);
    if (!table) return { ok: false, error: "TABLE_NOT_FOUND" };
    if (table.ownerId !== ownerId) return { ok: false, error: "NOT_AUTHORIZED" };

    if (muted) {
      await muteStore.mute(tableId, targetUserId);
    } else {
      await muteStore.unmute(tableId, targetUserId);
    }

    return { ok: true };
  }

  async isMuted(tableId: string, userId: string): Promise<boolean> {
    return await muteStore.isMuted(tableId, userId);
  }
}

export const moderationService = new ModerationService();
