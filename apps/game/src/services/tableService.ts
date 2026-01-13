import { v4 as uuidv4 } from "uuid";
import {
  ActionInput,
  HandState,
  Seat,
  Table,
  TableConfig,
  TableState,
  TableSummary,
} from "../domain/types";
import { applyAction, startHand } from "../engine/handEngine";
import { deriveLegalActions } from "../engine/actionRules";
import { balanceClient, eventClient } from "../api/grpc/clients";
import redisClient from "../storage/redisClient";
import { tableStore } from "../storage/tableStore";
import { tableStateStore } from "../storage/tableStateStore";

type BalanceReservation = { ok: boolean; reservation_id?: string; error?: string };
type BalanceCommit = { ok: boolean; error?: string };
type BalanceCashOut = { ok: boolean; error?: string };
type BalanceSettle = { ok: boolean; error?: string };
type EventPublish = { success: boolean };

const WS_PUBSUB_CHANNEL = "gateway:ws:events";

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

export class TableService {
  private turnTimers = new Map<string, NodeJS.Timeout>();

  private now() {
    return new Date().toISOString();
  }

  private idempotencyKey(operation: string, tableId: string, userId: string) {
    return `${operation}:${tableId}:${userId}:${Date.now()}`;
  }

  private buildTableStateView(table: Table, state: TableState) {
    const hand = state.hand ? this.redactHandState(state.hand) : null;
    return {
      tableId: table.tableId,
      name: table.name,
      ownerId: table.ownerId,
      config: table.config,
      status: table.status,
      hand,
      version: state.version,
      seats: state.seats.map((seat) => ({ ...seat, holeCards: null })),
      spectators: state.spectators,
      updatedAt: state.updatedAt,
      button: state.button,
    };
  }

  private redactHandState(hand: HandState) {
    return {
      handId: hand.handId,
      tableId: hand.tableId,
      street: hand.street,
      communityCards: hand.communityCards,
      pots: hand.pots,
      currentBet: hand.currentBet,
      minRaise: hand.minRaise,
      turn: hand.turn,
      lastAggressor: hand.lastAggressor,
      actions: hand.actions,
      rakeAmount: hand.rakeAmount,
      startedAt: hand.startedAt,
      winners: hand.winners,
      endedAt: hand.endedAt ?? null,
    };
  }

  private async publishTableState(table: Table, state: TableState) {
    const payload = { type: "TableSnapshot", tableState: this.buildTableStateView(table, state) };
    await redisClient.publish(
      WS_PUBSUB_CHANNEL,
      JSON.stringify({ channel: "table", tableId: table.tableId, payload, sourceId: "game-service" }),
    );
  }

  private async publishLobbyUpdate(tables: TableSummary[]) {
    await redisClient.publish(
      WS_PUBSUB_CHANNEL,
      JSON.stringify({
        channel: "lobby",
        tableId: "lobby",
        payload: { type: "LobbyTablesUpdated", tables },
        sourceId: "game-service",
      }),
    );
  }

  private redactTableState(state: TableState): TableState {
    return {
      ...state,
      seats: state.seats.map((seat) => ({ ...seat, holeCards: null })),
    };
  }

  async createTable(name: string, ownerId: string, configInput: TableConfig): Promise<Table> {
    const tableId = uuidv4();
    const createdAt = this.now();
    const table: Table = {
      tableId,
      name,
      ownerId,
      config: configInput,
      status: "WAITING",
      createdAt,
    };

    const seats: Seat[] = Array.from({ length: configInput.maxPlayers }, (_, index) => ({
      seatId: index,
      userId: null,
      stack: 0,
      status: "EMPTY",
      holeCards: null,
    }));

    const state: TableState = {
      tableId,
      seats,
      spectators: [],
      hand: null,
      button: 0,
      version: 0,
      updatedAt: createdAt,
    };

    await tableStore.save(table);
    await tableStateStore.save(state);
    await this.publishTableState(table, state);
    await this.publishLobbyUpdate(await this.listTableSummaries());
    return table;
  }

  async ensureMainTable(): Promise<void> {
    const tableIds = await tableStore.list();
    if (tableIds.length === 0) {
      await this.createTable("Main Table", "system", {
        smallBlind: 1,
        bigBlind: 2,
        ante: 0,
        maxPlayers: 9,
        startingStack: 200,
        turnTimerSeconds: 20,
      });
    }
  }

  async getTable(tableId: string): Promise<Table | null> {
    return tableStore.get(tableId);
  }

  async listTableSummaries(): Promise<TableSummary[]> {
    const tableIds = await tableStore.list();
    const summaries: TableSummary[] = [];
    for (const tableId of tableIds) {
      const table = await tableStore.get(tableId);
      const state = await tableStateStore.get(tableId);
      if (!table || !state) {
        continue;
      }
      const occupiedSeatIds = state.seats.filter((seat) => seat.userId).map((seat) => seat.seatId);
      summaries.push({
        tableId: table.tableId,
        name: table.name,
        ownerId: table.ownerId,
        config: table.config,
        seatsTaken: occupiedSeatIds.length,
        occupiedSeatIds,
        inProgress: state.hand !== null,
        spectatorCount: state.spectators.length,
      });
    }
    return summaries;
  }

  async deleteTable(tableId: string): Promise<boolean> {
    const table = await tableStore.get(tableId);
    if (!table) return false;
    await tableStore.delete(tableId, table.ownerId);
    await tableStateStore.delete(tableId);
    await this.publishLobbyUpdate(await this.listTableSummaries());
    return true;
  }

  async getTableState(tableId: string, userId?: string) {
    const state = await tableStateStore.get(tableId);
    if (!state) {
      return null;
    }
    const seat = userId ? state.seats.find((entry) => entry.userId === userId) : undefined;
    const holeCards = seat?.holeCards ?? [];
    return { state: this.redactTableState(state), holeCards };
  }

  async joinSeat(tableId: string, userId: string, seatId: number, buyInAmount: number) {
    const table = await tableStore.get(tableId);
    const state = await tableStateStore.get(tableId);
    if (!table || !state) return { ok: false, error: "TABLE_NOT_FOUND" };

    const startingStack = toNumber(table.config.startingStack, 200);
    const normalizedBuyIn = buyInAmount > 0 ? buyInAmount : startingStack;
    const finalBuyIn = normalizedBuyIn > 0 ? normalizedBuyIn : 200;

    const seat = state.seats.find((entry) => entry.seatId === seatId);
    if (!seat || seat.userId || seat.status !== "EMPTY") {
      return { ok: false, error: "SEAT_NOT_AVAILABLE" };
    }

    seat.userId = userId;
    seat.status = "RESERVED";
    state.version += 1;
    state.updatedAt = this.now();
    await tableStateStore.save(state);
    await this.publishTableState(table, state);
    await this.publishLobbyUpdate(await this.listTableSummaries());

    try {
      const reservation = await new Promise<BalanceReservation>((resolve, reject) => {
        balanceClient.ReserveForBuyIn(
          {
            account_id: userId,
            table_id: tableId,
            amount: finalBuyIn,
            idempotency_key: this.idempotencyKey("reserve", tableId, userId),
            timeout_seconds: 30,
          },
          (err: Error | null, response: unknown) => {
            if (err) reject(err);
            else resolve(response as BalanceReservation);
          },
        );
      });

      if (!reservation.ok || !reservation.reservation_id) {
        await this.rollbackSeat(tableId, seatId, userId);
        return { ok: false, error: reservation.error || "INSUFFICIENT_BALANCE" };
      }

      const commit = await new Promise<BalanceCommit>((resolve, reject) => {
        balanceClient.CommitReservation(
          { reservation_id: reservation.reservation_id },
          (err: Error | null, response: unknown) => {
            if (err) reject(err);
            else resolve(response as BalanceCommit);
          },
        );
      });

      if (!commit.ok) {
        await this.rollbackSeat(tableId, seatId, userId, reservation.reservation_id);
        return { ok: false, error: commit.error || "COMMIT_FAILED" };
      }

      const finalState = await tableStateStore.get(tableId);
      if (!finalState) return { ok: false, error: "TABLE_LOST" };
      const finalSeat = finalState.seats.find((entry) => entry.seatId === seatId);
      if (!finalSeat || finalSeat.userId !== userId) return { ok: false, error: "SEAT_LOST" };

      finalSeat.stack = finalBuyIn;
      finalSeat.status = "SEATED";
      finalSeat.reservationId = reservation.reservation_id;
      finalState.version += 1;
      finalState.updatedAt = this.now();

      await tableStateStore.save(finalState);
      await this.publishTableState(table, finalState);
      await this.publishLobbyUpdate(await this.listTableSummaries());

      await this.emitGameEvent(tableId, undefined, userId, seatId, "PLAYER_JOINED", { stack: finalBuyIn });

      await this.checkStartHand(table, finalState);

      return { ok: true };
    } catch (err) {
      await this.handleBalanceUnavailable(tableId, seatId, userId, finalBuyIn, err);
      return { ok: true };
    }
  }

  private async handleBalanceUnavailable(
    tableId: string,
    seatId: number,
    userId: string,
    buyInAmount: number,
    err: unknown,
  ) {
    console.error("Balance service unavailable:", err);
    const state = await tableStateStore.get(tableId);
    if (!state) return;
    const seat = state.seats.find((entry) => entry.seatId === seatId);
    if (!seat || seat.userId !== userId) return;
    seat.stack = buyInAmount;
    seat.status = "SEATED";
    seat.reservationId = undefined;
    state.version += 1;
    state.updatedAt = this.now();
    await tableStateStore.save(state);
    await this.emitGameEvent(tableId, undefined, userId, seatId, "BALANCE_UNAVAILABLE", { action: "BUY_IN" });
    const table = await tableStore.get(tableId);
    if (table) {
      await this.publishTableState(table, state);
      await this.publishLobbyUpdate(await this.listTableSummaries());
      await this.checkStartHand(table, state);
    }
  }

  private async rollbackSeat(tableId: string, seatId: number, userId: string, reservationId?: string) {
    if (reservationId) {
      balanceClient.ReleaseReservation(
        { reservation_id: reservationId, reason: "buy_in_failed" },
        () => undefined,
      );
    }
    const state = await tableStateStore.get(tableId);
    if (state) {
      const seat = state.seats.find((entry) => entry.seatId === seatId);
      if (seat && seat.userId === userId && seat.status === "RESERVED") {
        seat.userId = null;
        seat.status = "EMPTY";
        seat.stack = 0;
        seat.holeCards = null;
        seat.reservationId = undefined;
        state.version += 1;
        state.updatedAt = this.now();
        await tableStateStore.save(state);
        const table = await tableStore.get(tableId);
        if (table) {
          await this.publishTableState(table, state);
        }
      }
    }
  }

  async leaveSeat(tableId: string, userId: string) {
    const table = await tableStore.get(tableId);
    const state = await tableStateStore.get(tableId);
    if (!table || !state) return { ok: false, error: "TABLE_NOT_FOUND" };

    const seat = state.seats.find((entry) => entry.userId === userId);
    if (!seat) return { ok: false, error: "PLAYER_NOT_AT_TABLE" };

    if (state.hand && seat.status !== "FOLDED") {
      const result = applyAction(state, seat.seatId, { type: "FOLD" });
      if (result.accepted) {
        await tableStateStore.save(result.state);
        await this.publishTableState(table, result.state);
      }
    }

    const remainingStack = seat.stack;
    if (remainingStack > 0) {
      try {
        const cashOut = await new Promise<BalanceCashOut>((resolve, reject) => {
          balanceClient.ProcessCashOut(
            {
              account_id: userId,
              table_id: tableId,
              seat_id: seat.seatId,
              amount: remainingStack,
              idempotency_key: this.idempotencyKey("cashout", tableId, userId),
            },
            (err: Error | null, response: unknown) => {
              if (err) reject(err);
              else resolve(response as BalanceCashOut);
            },
          );
        });
        if (!cashOut.ok) {
          await this.emitGameEvent(tableId, undefined, userId, seat.seatId, "CASHOUT_FAILED", { amount: remainingStack });
        }
      } catch (_err) {
        await this.emitGameEvent(tableId, undefined, userId, seat.seatId, "BALANCE_UNAVAILABLE", { action: "CASH_OUT" });
      }
    }

    seat.userId = null;
    seat.stack = 0;
    seat.status = "EMPTY";
    seat.holeCards = null;
    seat.reservationId = undefined;
    state.version += 1;
    state.updatedAt = this.now();

    await tableStateStore.save(state);
    await this.publishTableState(table, state);
    await this.publishLobbyUpdate(await this.listTableSummaries());
    await this.emitGameEvent(tableId, undefined, userId, seat.seatId, "PLAYER_LEFT", { stack: remainingStack });
    return { ok: true };
  }

  async joinSpectator(tableId: string, userId: string) {
    const state = await tableStateStore.get(tableId);
    if (!state) return { ok: false, error: "TABLE_NOT_FOUND" };
    const table = await tableStore.get(tableId);
    if (!table) return { ok: false, error: "TABLE_NOT_FOUND" };
    const seated = state.seats.find((seat) => seat.userId === userId);
    if (seated) {
      return { ok: true };
    }
    const existing = state.spectators.find((spectator) => spectator.userId === userId);
    if (existing) {
      return { ok: true };
    }
    state.spectators.push({ userId, status: "ACTIVE", joinedAt: this.now() });
    state.version += 1;
    state.updatedAt = this.now();
    await tableStateStore.save(state);
    await this.publishTableState(table, state);
    await this.publishLobbyUpdate(await this.listTableSummaries());
    return { ok: true };
  }

  async leaveSpectator(tableId: string, userId: string) {
    const state = await tableStateStore.get(tableId);
    if (!state) return { ok: false, error: "TABLE_NOT_FOUND" };
    const table = await tableStore.get(tableId);
    if (!table) return { ok: false, error: "TABLE_NOT_FOUND" };
    state.spectators = state.spectators.filter((spectator) => spectator.userId !== userId);
    state.version += 1;
    state.updatedAt = this.now();
    await tableStateStore.save(state);
    await this.publishTableState(table, state);
    await this.publishLobbyUpdate(await this.listTableSummaries());
    return { ok: true };
  }

  async submitAction(tableId: string, userId: string, action: ActionInput) {
    const table = await tableStore.get(tableId);
    const state = await tableStateStore.get(tableId);
    if (!table || !state) return { ok: false, error: "TABLE_NOT_FOUND" };
    if (!state.hand) return { ok: false, error: "NO_HAND_IN_PROGRESS" };

    const seat = state.seats.find((entry) => entry.userId === userId);
    if (!seat) return { ok: false, error: "PLAYER_NOT_AT_TABLE" };

    const result = applyAction(state, seat.seatId, action);
    if (!result.accepted) {
      return { ok: false, error: result.reason || "INVALID_ACTION" };
    }

    await tableStateStore.save(result.state);
    await this.publishTableState(table, result.state);

    await this.emitGameEvent(tableId, result.state.hand?.handId, userId, seat.seatId, action.type, {
      amount: action.amount ?? 0,
    });

    if (result.handComplete && result.state.hand) {
      this.clearTurnTimer(tableId);
      await this.handleHandEnded(table, result.state);
    } else {
      this.startTurnTimer(table, result.state);
    }

    return { ok: true };
  }

  private async checkStartHand(table: Table, state: TableState) {
    if (table.status === "PLAYING" || state.hand) return;

    const activePlayers = state.seats.filter((seat) => seat.userId && seat.status === "SEATED");
    if (activePlayers.length >= 2) {
      const updatedState = startHand(state, table.config);
      table.status = "PLAYING";
      await tableStore.save(table);
      await tableStateStore.save(updatedState);
      await this.publishTableState(table, updatedState);
      await this.publishLobbyUpdate(await this.listTableSummaries());

      const participants = updatedState.seats
        .filter((seat) => seat.status === "ACTIVE" || seat.status === "ALL_IN")
        .map((seat) => seat.userId)
        .filter((value): value is string => Boolean(value));

      await this.emitGameEvent(table.tableId, updatedState.hand?.handId, undefined, undefined, "HAND_STARTED", {
        buttonSeat: updatedState.button,
        participants,
      });

      this.startTurnTimer(table, updatedState);
    }
  }

  private startTurnTimer(table: Table, state: TableState) {
    if (!state.hand) {
      this.clearTurnTimer(state.tableId);
      return;
    }

    this.clearTurnTimer(state.tableId);
    const timeoutMs = (table.config.turnTimerSeconds || 20) * 1000;

    const timer = setTimeout(async () => {
      const currentState = await tableStateStore.get(state.tableId);
      if (!currentState || !currentState.hand || currentState.hand.handId !== state.hand?.handId) return;
      if (currentState.hand.turn !== state.hand.turn) return;

      const seat = currentState.seats[currentState.hand.turn];
      if (!seat || !seat.userId) return;

      const legalActions = deriveLegalActions(currentState.hand, seat);
      const canCheck = legalActions.some((entry) => entry.type === "CHECK");
      const actionInput: ActionInput = canCheck ? { type: "CHECK" } : { type: "FOLD" };
      await this.submitAction(state.tableId, seat.userId, actionInput);
    }, timeoutMs);

    this.turnTimers.set(state.tableId, timer);
  }

  private clearTurnTimer(tableId: string) {
    const existing = this.turnTimers.get(tableId);
    if (existing) {
      clearTimeout(existing);
      this.turnTimers.delete(tableId);
    }
  }

  private async handleHandEnded(table: Table, state: TableState) {
    const hand = state.hand;
    if (!hand) return;

    const winnerUserIds = (hand.winners || [])
      .map((seatId) => state.seats.find((seat) => seat.seatId === seatId)?.userId)
      .filter((value): value is string => Boolean(value));

    await this.emitGameEvent(table.tableId, hand.handId, undefined, undefined, "HAND_ENDED", {
      winners: hand.winners ?? [],
      winnerUserIds,
      rakeAmount: hand.rakeAmount,
    });

    for (const pot of hand.pots) {
      if (pot.amount > 0 && pot.winners && pot.winners.length > 0) {
        const share = Math.floor(pot.amount / pot.winners.length);
        let remainder = pot.amount - share * pot.winners.length;
        const sortedWinners = [...pot.winners].sort((a, b) => {
          const distA = (a - state.button + state.seats.length) % state.seats.length;
          const distB = (b - state.button + state.seats.length) % state.seats.length;
          return distA - distB;
        });

        const winnersToSettle = sortedWinners.map((seatId) => {
          const winAmount = share + (remainder > 0 ? 1 : 0);
          remainder = Math.max(0, remainder - 1);
          return {
            seat_id: seatId,
            account_id: state.seats[seatId]?.userId ?? "",
            amount: winAmount,
          };
        });

        try {
          const settle = await new Promise<BalanceSettle>((resolve, reject) => {
            balanceClient.SettlePot(
              {
                table_id: table.tableId,
                hand_id: hand.handId,
                winners: winnersToSettle,
                idempotency_key: this.idempotencyKey("settle", table.tableId, hand.handId),
              },
              (err: Error | null, response: unknown) => {
                if (err) reject(err);
                else resolve(response as BalanceSettle);
              },
            );
          });
          if (!settle.ok) {
            await this.emitGameEvent(table.tableId, hand.handId, undefined, undefined, "SETTLEMENT_FAILED", {
              error: settle.error || "UNKNOWN",
            });
          }
        } catch (_err) {
          await this.emitGameEvent(table.tableId, hand.handId, undefined, undefined, "BALANCE_UNAVAILABLE", {
            action: "SETTLE_POT",
          });
        }
      }
    }

    state.hand = null;
    state.version += 1;
    state.updatedAt = this.now();
    table.status = "WAITING";
    await tableStore.save(table);
    await tableStateStore.save(state);
    await this.publishTableState(table, state);
    await this.publishLobbyUpdate(await this.listTableSummaries());

    setTimeout(async () => {
      const freshState = await tableStateStore.get(state.tableId);
      const freshTable = await tableStore.get(state.tableId);
      if (freshState && freshTable) {
        await this.checkStartHand(freshTable, freshState);
      }
    }, 3000);
  }

  private async emitGameEvent(
    tableId: string,
    handId: string | undefined,
    userId: string | undefined,
    seatId: number | undefined,
    type: string,
    payload: Record<string, unknown>,
  ) {
    try {
      const response = await new Promise<EventPublish>((resolve, reject) => {
        eventClient.PublishEvent(
          {
            type,
            table_id: tableId,
            hand_id: handId,
            user_id: userId,
            seat_id: seatId,
            payload: this.toStruct(payload),
            idempotency_key: uuidv4(),
          },
          (err: Error | null, resp: unknown) => {
            if (err) reject(err);
            else resolve(resp as EventPublish);
          },
        );
      });
      if (!response.success) {
        console.error("Failed to emit game event");
      }
    } catch (err) {
      console.error("Failed to emit game event:", err);
    }
  }

  private toStruct(obj: Record<string, unknown>) {
    const struct: { fields: Record<string, unknown> } = { fields: {} };
    for (const [key, value] of Object.entries(obj)) {
      struct.fields[key] = this.toValue(value);
    }
    return struct;
  }

  private toValue(value: unknown): Record<string, unknown> {
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "number") return { numberValue: value };
    if (typeof value === "boolean") return { boolValue: value };
    if (Array.isArray(value)) {
      return { listValue: { values: value.map((entry) => this.toValue(entry)) } };
    }
    if (value === null || value === undefined) return { nullValue: "NULL_VALUE" };
    if (typeof value === "object") return { structValue: this.toStruct(value as Record<string, unknown>) };
    return { stringValue: String(value) };
  }

}

export const tableService = new TableService();
