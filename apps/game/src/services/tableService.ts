import { v4 as uuidv4 } from "uuid";

import { ActionInput, Seat, Table, TableConfig, TableState, TableSummary } from "../domain/types";
import { applyAction, startHand } from "../engine/handEngine";
import { deriveLegalActions } from "../engine/actionRules";
import { calculatePots } from "../engine/potCalculator";
import { tableStore } from "../storage/tableStore";
import { tableStateStore } from "../storage/tableStateStore";
import logger from "../observability/logger";
import {
  recordAction,
  recordHandCompleted,
  recordHandStarted,
  recordSeatJoin,
  recordTurnTime,
  recordTurnTimeout,
  setActiveTables,
  setSeatedPlayers,
  setSpectatorCount,
} from "../observability/metrics";
import { coerceNumber } from "../utils/coerce";

import { balanceClientAdapter } from "./table/balanceClientAdapter";
import { gatewayWsPublisher } from "./table/gatewayWsPublisher";
import { gameEventPublisher } from "./table/gameEventPublisher";
import { redactTableState } from "./table/tableViewBuilder";

type TurnStartMeta = { handId: string; seatId: number; street: string; startedAt: number };
type HandTimeoutMeta = { handId: string; hadTimeout: boolean };

export class TableService {
  private turnTimers = new Map<string, NodeJS.Timeout>();
  private turnStartMeta = new Map<string, TurnStartMeta>();
  private handTimeoutMeta = new Map<string, HandTimeoutMeta>();

  private now() {
    return new Date().toISOString();
  }

  private touchState(state: TableState) {
    state.version += 1;
    state.updatedAt = this.now();
  }

  private newIdempotencyKey(prefix: string) {
    return `${prefix}:${uuidv4()}`;
  }

  private settlePotIdempotencyKey(tableId: string, handId: string, potIndex: number) {
    return `settle:${tableId}:${handId}:pot:${potIndex}`;
  }

  private cashOutIdempotencyKey(tableId: string, userId: string, seatId: number) {
    return this.newIdempotencyKey(`cashout:${tableId}:${userId}:${seatId}`);
  }

  private resolveSeatForUser(state: TableState, userId: string): Seat | undefined {
    const matching = state.seats.filter((entry) => entry.userId === userId);
    if (matching.length === 0) {
      return undefined;
    }
    if (matching.length === 1) {
      return matching[0];
    }

    const turnSeatId = state.hand?.turn;
    if (typeof turnSeatId === "number") {
      const turnMatch = matching.find((seat) => seat.seatId === turnSeatId);
      if (turnMatch) {
        return turnMatch;
      }
    }

    const withHoleCards = matching.find((seat) => (seat.holeCards?.length ?? 0) === 2);
    if (withHoleCards) {
      return withHoleCards;
    }

    const inHandSeat =
      matching.find((seat) => seat.status === "ACTIVE" || seat.status === "ALL_IN" || seat.status === "FOLDED") ??
      matching[0];
    return inHandSeat;
  }

  private findNextActiveTurn(seats: Seat[], startSeatId: number) {
    if (seats.length === 0) {
      return null;
    }
    const total = seats.length;
    const normalizedStart = ((startSeatId % total) + total) % total;
    for (let offset = 0; offset < total; offset += 1) {
      const seatId = (normalizedStart + offset) % total;
      const seat = seats[seatId];
      if (seat?.status === "ACTIVE" && seat.userId) {
        return seatId;
      }
    }
    return null;
  }

  private async repairTurnIfNeeded(table: Table, state: TableState) {
    if (!state.hand) {
      return state;
    }

    const turnSeatId = state.hand.turn;
    const seat = state.seats[turnSeatId];
    if (seat?.status === "ACTIVE" && seat.userId) {
      return state;
    }

    const nextTurn = this.findNextActiveTurn(state.seats, turnSeatId);
    if (nextTurn === null) {
      logger.warn({ tableId: state.tableId, turnSeatId }, "turn.repair.failed");
      return state;
    }

    state.hand.turn = nextTurn;
    state.version += 1;
    state.updatedAt = this.now();
    await tableStateStore.save(state);
    await gatewayWsPublisher.publishTableState(table, state);
    return state;
  }

  private async loadTableAndState(tableId: string) {
    const table = await tableStore.get(tableId);
    const state = await tableStateStore.get(tableId);
    if (!table || !state) {
      return null;
    }
    return { table, state };
  }

  private async publishTableAndLobby(table: Table, state: TableState) {
    await gatewayWsPublisher.publishTableState(table, state);
    await gatewayWsPublisher.publishLobbyUpdate(await this.listTableSummaries());
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
    await this.publishTableAndLobby(table, state);
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
    let activeTableCount = 0;
    let seatedPlayerCount = 0;
    let spectatorTotal = 0;
    for (const tableId of tableIds) {
      const table = await tableStore.get(tableId);
      const state = await tableStateStore.get(tableId);
      if (!table || !state) {
        continue;
      }
      const occupiedSeatIds = state.seats.filter((seat) => seat.status !== "EMPTY").map((seat) => seat.seatId);
      seatedPlayerCount += state.seats.filter((seat) => Boolean(seat.userId) && seat.status !== "EMPTY").length;
      spectatorTotal += state.spectators.length;
      if (state.hand) {
        activeTableCount += 1;
      }
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
    setActiveTables(activeTableCount);
    setSeatedPlayers(seatedPlayerCount);
    setSpectatorCount(spectatorTotal);
    return summaries;
  }

  async deleteTable(tableId: string): Promise<boolean> {
    const table = await tableStore.get(tableId);
    if (!table) return false;
    await tableStore.delete(tableId, table.ownerId);
    await tableStateStore.delete(tableId);
    await gatewayWsPublisher.publishLobbyUpdate(await this.listTableSummaries());
    return true;
  }

  async getTableState(tableId: string, userId?: string) {
    const state = await tableStateStore.get(tableId);
    if (!state) {
      return null;
    }
    if (state.hand && !this.turnTimers.has(tableId)) {
      const table = await tableStore.get(tableId);
      if (table) {
        void this.startTurnTimer(table, state);
      }
    }
    const seat = userId ? this.resolveSeatForUser(state, userId) : undefined;
    const holeCards = seat?.holeCards ?? [];
    return { state: redactTableState(state), holeCards };
  }

  async joinSeat(tableId: string, userId: string, seatId: number, buyInAmount: number) {
    const loaded = await this.loadTableAndState(tableId);
    if (!loaded) {
      recordSeatJoin("error", "TABLE_NOT_FOUND");
      return { ok: false, error: "TABLE_NOT_FOUND" };
    }
    const { table, state } = loaded;

    const startingStack = coerceNumber(table.config.startingStack, 200);
    const normalizedBuyIn = buyInAmount > 0 ? buyInAmount : startingStack;
    const finalBuyIn = normalizedBuyIn > 0 ? normalizedBuyIn : 200;

    const existingSeat = state.seats.find((entry) => entry.userId === userId && entry.status !== "EMPTY");
    if (existingSeat) {
      if (existingSeat.seatId !== seatId) {
        recordSeatJoin("error", "ALREADY_SEATED");
        return { ok: false, error: "ALREADY_SEATED" };
      }

      if (existingSeat.status === "SEATED") {
        recordSeatJoin("ok", "IDEMPOTENT");
        return { ok: true };
      }

      if (existingSeat.status !== "RESERVED") {
        recordSeatJoin("error", "ALREADY_SEATED");
        return { ok: false, error: "ALREADY_SEATED" };
      }

      try {
        const result = await this.finalizeReservedSeatJoin(table, tableId, seatId, userId, finalBuyIn);
        recordSeatJoin(result.ok ? "ok" : "error", result.ok ? "RESUMED" : (result.error ?? "UNKNOWN"));
        return result;
      } catch (err) {
        await this.handleBalanceUnavailable(tableId, seatId, userId, finalBuyIn, err);
        recordSeatJoin("ok", "BALANCE_UNAVAILABLE");
        return { ok: true };
      }
    }

    const seat = state.seats.find((entry) => entry.seatId === seatId);
    if (!seat || seat.userId || seat.status !== "EMPTY") {
      recordSeatJoin("error", "SEAT_NOT_AVAILABLE");
      return { ok: false, error: "SEAT_NOT_AVAILABLE" };
    }

    seat.userId = userId;
    seat.status = "RESERVED";
    seat.pendingBuyInAmount = finalBuyIn;
    seat.buyInIdempotencyKey = this.newIdempotencyKey(`buyin:${tableId}:${seatId}:${userId}`);
    this.touchState(state);
    await tableStateStore.save(state);
    await this.publishTableAndLobby(table, state);

    try {
      const result = await this.finalizeReservedSeatJoin(table, tableId, seatId, userId, finalBuyIn);
      recordSeatJoin(result.ok ? "ok" : "error", result.ok ? "OK" : (result.error ?? "UNKNOWN"));
      return result;
    } catch (err) {
      await this.handleBalanceUnavailable(tableId, seatId, userId, finalBuyIn, err);
      recordSeatJoin("ok", "BALANCE_UNAVAILABLE");
      return { ok: true };
    }
  }

  private async finalizeReservedSeatJoin(
    table: Table,
    tableId: string,
    seatId: number,
    userId: string,
    fallbackBuyInAmount: number,
  ): Promise<{ ok: boolean; error?: string }> {
    const reservedState = await tableStateStore.get(tableId);
    if (!reservedState) {
      return { ok: false, error: "TABLE_LOST" };
    }

    const reservedSeat = reservedState.seats.find((entry) => entry.seatId === seatId);
    if (!reservedSeat || reservedSeat.userId !== userId || reservedSeat.status !== "RESERVED") {
      return { ok: false, error: "SEAT_LOST" };
    }

    const pendingBuyInAmount = coerceNumber(reservedSeat.pendingBuyInAmount, fallbackBuyInAmount);
    const buyInAmount = pendingBuyInAmount > 0 ? pendingBuyInAmount : fallbackBuyInAmount;

    if (!reservedSeat.buyInIdempotencyKey) {
      reservedSeat.buyInIdempotencyKey = this.newIdempotencyKey(`buyin:${tableId}:${seatId}:${userId}`);
      reservedSeat.pendingBuyInAmount = buyInAmount;
      this.touchState(reservedState);
      await tableStateStore.save(reservedState);
    }

    let reservationId = reservedSeat.reservationId;
    if (!reservationId) {
      const reservation = await balanceClientAdapter.reserveForBuyIn({
        account_id: userId,
        table_id: tableId,
        amount: buyInAmount,
        idempotency_key: reservedSeat.buyInIdempotencyKey,
        timeout_seconds: 30,
      });

      reservationId = reservation.reservation_id;
      if (!reservation.ok || !reservationId) {
        await this.rollbackSeat(tableId, seatId, userId);
        return { ok: false, error: reservation.error || "INSUFFICIENT_BALANCE" };
      }

      reservedSeat.reservationId = reservationId;
      this.touchState(reservedState);
      await tableStateStore.save(reservedState);
    }

    const commit = await balanceClientAdapter.commitReservation({ reservation_id: reservationId });
    if (!commit.ok) {
      await this.rollbackSeat(tableId, seatId, userId, reservationId);
      return { ok: false, error: commit.error || "COMMIT_FAILED" };
    }

    const finalState = await tableStateStore.get(tableId);
    if (!finalState) {
      return { ok: false, error: "TABLE_LOST" };
    }
    const finalSeat = finalState.seats.find((entry) => entry.seatId === seatId);
    if (!finalSeat || finalSeat.userId !== userId) {
      return { ok: false, error: "SEAT_LOST" };
    }

    finalSeat.stack = buyInAmount;
    finalSeat.status = "SEATED";
    finalSeat.reservationId = reservationId;
    finalSeat.pendingBuyInAmount = undefined;
    finalSeat.buyInIdempotencyKey = undefined;

    this.touchState(finalState);
    await tableStateStore.save(finalState);
    await this.publishTableAndLobby(table, finalState);

    void this.emitGameEvent(tableId, undefined, userId, seatId, "PLAYER_JOINED", { stack: buyInAmount });

    await this.checkStartHand(table, finalState);

    return { ok: true };
  }

  private async handleBalanceUnavailable(
    tableId: string,
    seatId: number,
    userId: string,
    buyInAmount: number,
    err: unknown,
  ) {
    logger.error({ err, tableId, seatId, userId }, "Balance service unavailable");
    const state = await tableStateStore.get(tableId);
    if (!state) return;
    const seat = state.seats.find((entry) => entry.seatId === seatId);
    if (!seat || seat.userId !== userId) return;
    seat.stack = buyInAmount;
    seat.status = "SEATED";
    seat.reservationId = undefined;
    seat.pendingBuyInAmount = undefined;
    seat.buyInIdempotencyKey = undefined;
    this.touchState(state);
    await tableStateStore.save(state);
    void this.emitGameEvent(tableId, undefined, userId, seatId, "BALANCE_UNAVAILABLE", { action: "BUY_IN" });
    const table = await tableStore.get(tableId);
    if (!table) return;
    await this.publishTableAndLobby(table, state);
    await this.checkStartHand(table, state);
  }

  private async rollbackSeat(tableId: string, seatId: number, userId: string, reservationId?: string) {
    if (reservationId) {
      balanceClientAdapter.releaseReservation({ reservation_id: reservationId, reason: "buy_in_failed" });
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
        seat.pendingBuyInAmount = undefined;
        seat.buyInIdempotencyKey = undefined;
        this.touchState(state);
        await tableStateStore.save(state);
        const table = await tableStore.get(tableId);
        if (table) {
          await this.publishTableAndLobby(table, state);
        }
      }
    }
  }

  async leaveSeat(tableId: string, userId: string) {
    const loaded = await this.loadTableAndState(tableId);
    if (!loaded) return { ok: false, error: "TABLE_NOT_FOUND" };
    const { table, state } = loaded;

    const seat = this.resolveSeatForUser(state, userId);
    if (!seat) return { ok: false, error: "PLAYER_NOT_AT_TABLE" };

    if (seat.status === "RESERVED" && seat.reservationId) {
      balanceClientAdapter.releaseReservation({ reservation_id: seat.reservationId, reason: "player_left" });
    }

    const remainingStack = seat.stack;
    const shouldCashOut = remainingStack > 0;

    if (state.hand) {
      const wasTurnSeat = state.hand.turn === seat.seatId;
      const wasInHand =
        seat.status === "ACTIVE" ||
        seat.status === "ALL_IN" ||
        seat.status === "FOLDED" ||
        seat.status === "DISCONNECTED";

      if (wasInHand && seat.status !== "FOLDED") {
        seat.status = "FOLDED";
      }

      seat.userId = null;
      seat.stack = 0;
      seat.holeCards = null;
      seat.reservationId = undefined;
      seat.pendingBuyInAmount = undefined;
      seat.buyInIdempotencyKey = undefined;

      if (!wasInHand) {
        seat.status = "EMPTY";
      } else {
        const foldedSeatIds = new Set(
          state.seats.filter((entry) => entry.status === "FOLDED").map((entry) => entry.seatId),
        );
        state.hand.pots = calculatePots(state.hand.totalContributions, foldedSeatIds);
      }

      if (wasTurnSeat) {
        const nextTurn = this.findNextActiveTurn(state.seats, state.hand.turn);
        if (nextTurn !== null) {
          state.hand.turn = nextTurn;
        }
      }

      this.touchState(state);
      await tableStateStore.save(state);
      await this.publishTableAndLobby(table, state);
      void this.emitGameEvent(tableId, state.hand.handId, userId, seat.seatId, "PLAYER_LEFT", { stack: remainingStack });

      if (shouldCashOut) {
        try {
          const cashOut = await balanceClientAdapter.processCashOut({
            account_id: userId,
            table_id: tableId,
            seat_id: seat.seatId,
            amount: remainingStack,
            idempotency_key: this.cashOutIdempotencyKey(tableId, userId, seat.seatId),
          });
          if (!cashOut.ok) {
            void this.emitGameEvent(tableId, undefined, userId, seat.seatId, "CASHOUT_FAILED", { amount: remainingStack });
          }
        } catch {
          void this.emitGameEvent(tableId, undefined, userId, seat.seatId, "BALANCE_UNAVAILABLE", { action: "CASH_OUT" });
        }
      }

      if (wasTurnSeat) {
        void this.startTurnTimer(table, state);
      }
      return { ok: true };
    }

    if (remainingStack > 0) {
      try {
        const cashOut = await balanceClientAdapter.processCashOut({
          account_id: userId,
          table_id: tableId,
          seat_id: seat.seatId,
          amount: remainingStack,
          idempotency_key: this.cashOutIdempotencyKey(tableId, userId, seat.seatId),
        });
        if (!cashOut.ok) {
          void this.emitGameEvent(tableId, undefined, userId, seat.seatId, "CASHOUT_FAILED", { amount: remainingStack });
        }
      } catch {
        void this.emitGameEvent(tableId, undefined, userId, seat.seatId, "BALANCE_UNAVAILABLE", { action: "CASH_OUT" });
      }
    }

    seat.userId = null;
    seat.stack = 0;
    seat.status = "EMPTY";
    seat.holeCards = null;
    seat.reservationId = undefined;
    seat.pendingBuyInAmount = undefined;
    seat.buyInIdempotencyKey = undefined;
    this.touchState(state);

    await tableStateStore.save(state);
    await this.publishTableAndLobby(table, state);
    void this.emitGameEvent(tableId, undefined, userId, seat.seatId, "PLAYER_LEFT", { stack: remainingStack });
    return { ok: true };
  }

  async joinSpectator(tableId: string, userId: string) {
    const loaded = await this.loadTableAndState(tableId);
    if (!loaded) return { ok: false, error: "TABLE_NOT_FOUND" };
    const { table, state } = loaded;
    if (state.seats.some((seat) => seat.userId === userId)) {
      return { ok: true };
    }
    if (state.spectators.some((spectator) => spectator.userId === userId)) {
      return { ok: true };
    }
    state.spectators.push({ userId, status: "ACTIVE", joinedAt: this.now() });
    state.version += 1;
    state.updatedAt = this.now();
    await tableStateStore.save(state);
    await this.publishTableAndLobby(table, state);
    return { ok: true };
  }

  async leaveSpectator(tableId: string, userId: string) {
    const loaded = await this.loadTableAndState(tableId);
    if (!loaded) return { ok: false, error: "TABLE_NOT_FOUND" };
    const { table, state } = loaded;
    state.spectators = state.spectators.filter((spectator) => spectator.userId !== userId);
    state.version += 1;
    state.updatedAt = this.now();
    await tableStateStore.save(state);
    await this.publishTableAndLobby(table, state);
    return { ok: true };
  }

  async submitAction(tableId: string, userId: string, action: ActionInput) {
    const loaded = await this.loadTableAndState(tableId);
    if (!loaded) return { ok: false, error: "TABLE_NOT_FOUND" };
    const { table, state } = loaded;
    if (!state.hand) return { ok: false, error: "NO_HAND_IN_PROGRESS" };

    const actionStreet = state.hand.street;

    const seat = this.resolveSeatForUser(state, userId);
    if (!seat) return { ok: false, error: "PLAYER_NOT_AT_TABLE" };

    const startedTurn = this.turnStartMeta.get(tableId);
    const turnDurationMs =
      startedTurn && startedTurn.handId === state.hand.handId && startedTurn.seatId === seat.seatId
        ? Date.now() - startedTurn.startedAt
        : null;

    const result = applyAction(state, seat.seatId, action, { allowInactive: true });
    if (!result.accepted) {
      return { ok: false, error: result.reason || "INVALID_ACTION" };
    }

    if (turnDurationMs !== null && startedTurn) {
      recordTurnTime(startedTurn.street, action.type, turnDurationMs);
    }

    recordAction(action.type);

    await tableStateStore.save(result.state);
    await gatewayWsPublisher.publishTableState(table, result.state);

    const hand = result.state.hand;
    const actionRecord = hand?.actions[hand.actions.length - 1];
    const actedSeat = result.state.seats[seat.seatId];
    const isAllIn = actedSeat?.status === "ALL_IN" || actionRecord?.type === "ALL_IN";
    void this.emitGameEvent(tableId, hand?.handId, userId, seat.seatId, "ACTION_TAKEN", {
      seatId: seat.seatId,
      action: actionRecord?.type ?? action.type,
      amount: actionRecord?.amount ?? action.amount ?? 0,
      isAllIn,
      street: actionStreet,
    });

    if (result.handComplete && result.state.hand) {
      this.clearTurnTimer(tableId);
      this.turnStartMeta.delete(tableId);
      await this.handleHandEnded(table, result.state);
    } else {
      void this.startTurnTimer(table, result.state);
    }

    return { ok: true };
  }

  private async checkStartHand(table: Table, state: TableState) {
    if (table.status === "PLAYING" || state.hand) return;

    const activePlayers = state.seats.filter((seat) => seat.userId && seat.status === "SEATED");
    if (activePlayers.length < 2) return;

    const updatedState = startHand(state, table.config);
    table.status = "PLAYING";
    await tableStore.save(table);
    await tableStateStore.save(updatedState);
    await this.publishTableAndLobby(table, updatedState);

    if (updatedState.hand) {
      recordHandStarted(table.tableId);
      this.handTimeoutMeta.set(table.tableId, { handId: updatedState.hand.handId, hadTimeout: false });
    }

    const participants = updatedState.seats
      .filter((seat) => seat.status === "ACTIVE" || seat.status === "ALL_IN")
      .map((seat) => seat.userId)
      .filter((value): value is string => Boolean(value));

    void this.emitGameEvent(table.tableId, updatedState.hand?.handId, undefined, undefined, "HAND_STARTED", {
      buttonSeat: updatedState.button,
      participants,
    });

    void this.startTurnTimer(table, updatedState);
  }

  private async startTurnTimer(table: Table, state: TableState) {
    if (!state.hand) {
      this.clearTurnTimer(state.tableId);
      this.turnStartMeta.delete(state.tableId);
      return;
    }

    this.clearTurnTimer(state.tableId);
    const repairedState = await this.repairTurnIfNeeded(table, state);
    const timeoutMs = (table.config.turnTimerSeconds || 20) * 1000;

    if (repairedState.hand) {
      this.turnStartMeta.set(repairedState.tableId, {
        handId: repairedState.hand.handId,
        seatId: repairedState.hand.turn,
        street: repairedState.hand.street,
        startedAt: Date.now(),
      });

      const previousTimeout = this.handTimeoutMeta.get(repairedState.tableId);
      if (!previousTimeout || previousTimeout.handId !== repairedState.hand.handId) {
        this.handTimeoutMeta.set(repairedState.tableId, { handId: repairedState.hand.handId, hadTimeout: false });
      }
    }

    const timer = setTimeout(async () => {
      this.turnTimers.delete(repairedState.tableId);
      const currentState = await tableStateStore.get(repairedState.tableId);
      if (!currentState || !currentState.hand || currentState.hand.handId !== repairedState.hand?.handId) return;
      if (currentState.hand.turn !== repairedState.hand.turn) return;

      const expectedTurnSeatId = currentState.hand.turn;
      const fixedState = await this.repairTurnIfNeeded(table, currentState);
      if (!fixedState.hand) return;
      if (fixedState.hand.turn !== expectedTurnSeatId) {
        void this.startTurnTimer(table, fixedState);
        return;
      }

      const seat = fixedState.seats[fixedState.hand?.turn ?? -1];
      if (!seat || !seat.userId) {
        void this.startTurnTimer(table, fixedState);
        return;
      }

      const legalActions = deriveLegalActions(fixedState.hand, seat);
      const canCheck = legalActions.some((entry) => entry.type === "CHECK");
      const actionInput: ActionInput = canCheck ? { type: "CHECK" } : { type: "FOLD" };

      recordTurnTimeout(fixedState.hand.street, actionInput.type);
      const timeoutMeta = this.handTimeoutMeta.get(fixedState.tableId);
      if (timeoutMeta && timeoutMeta.handId === fixedState.hand.handId) {
        timeoutMeta.hadTimeout = true;
      } else {
        this.handTimeoutMeta.set(fixedState.tableId, { handId: fixedState.hand.handId, hadTimeout: true });
      }

      const result = await this.submitAction(fixedState.tableId, seat.userId, actionInput);
      if (!result.ok) {
        void this.startTurnTimer(table, await tableStateStore.get(fixedState.tableId).then((fresh) => fresh ?? fixedState));
      }
    }, timeoutMs);

    this.turnTimers.set(repairedState.tableId, timer);
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

    const timeoutMeta = this.handTimeoutMeta.get(table.tableId);
    const hadTimeout = timeoutMeta?.handId === hand.handId && timeoutMeta.hadTimeout;
    const lastAction = hand.actions[hand.actions.length - 1];
    const outcome = hadTimeout ? "timeout" : lastAction?.type === "FOLD" ? "fold_win" : "showdown";
    recordHandCompleted(table.tableId, outcome);
    this.handTimeoutMeta.delete(table.tableId);

    const winnerUserIds = (hand.winners || [])
      .map((seatId) => state.seats.find((seat) => seat.seatId === seatId)?.userId)
      .filter((value): value is string => Boolean(value));

    void this.emitGameEvent(table.tableId, hand.handId, undefined, undefined, "HAND_ENDED", {
      winners: hand.winners ?? [],
      winnerUserIds,
      rakeAmount: hand.rakeAmount,
    });

    for (let potIndex = 0; potIndex < hand.pots.length; potIndex += 1) {
      const pot = hand.pots[potIndex];
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
          const settle = await balanceClientAdapter.settlePot({
            table_id: table.tableId,
            hand_id: hand.handId,
            winners: winnersToSettle,
            idempotency_key: this.settlePotIdempotencyKey(table.tableId, hand.handId, potIndex),
          });
          if (!settle.ok) {
            void this.emitGameEvent(table.tableId, hand.handId, undefined, undefined, "SETTLEMENT_FAILED", {
              error: settle.error || "UNKNOWN",
            });
          }
        } catch {
          void this.emitGameEvent(table.tableId, hand.handId, undefined, undefined, "BALANCE_UNAVAILABLE", {
            action: "SETTLE_POT",
          });
        }
      }
    }

    state.hand = null;
    this.touchState(state);
    table.status = "WAITING";
    await tableStore.save(table);
    await tableStateStore.save(state);
    await this.publishTableAndLobby(table, state);

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
    await gameEventPublisher.publish({
      type,
      tableId,
      handId,
      userId,
      seatId,
      payload,
    });
  }

}

export const tableService = new TableService();
