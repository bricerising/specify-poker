import { describe, expect, it, beforeEach } from "vitest";
import {
  createPot,
  ensurePot,
  recordContribution,
  calculatePots,
  settlePot,
  cancelPot,
  getPotState,
} from "../../src/services/tablePotService";
import { ensureAccount, getBalance } from "../../src/services/accountService";
import { resetAccounts } from "../../src/storage/accountStore";
import { resetTransactions } from "../../src/storage/transactionStore";
import { resetReservations } from "../../src/storage/reservationStore";
import { resetIdempotency } from "../../src/storage/idempotencyStore";
import { resetLedger } from "../../src/storage/ledgerStore";
import { resetTablePots } from "../../src/storage/tablePotStore";

describe("tablePotService", () => {
  beforeEach(async () => {
    await resetAccounts();
    await resetTransactions();
    await resetReservations();
    await resetIdempotency();
    await resetLedger();
    await resetTablePots();
  });

  describe("createPot", () => {
    it("creates a new pot for a hand", async () => {
      const pot = await createPot("table-1", "hand-1");

      expect(pot.potId).toBe("table-1:hand-1");
      expect(pot.tableId).toBe("table-1");
      expect(pot.handId).toBe("hand-1");
      expect(pot.status).toBe("ACTIVE");
      expect(pot.contributions).toEqual({});
      expect(pot.pots).toEqual([]);
      expect(pot.rakeAmount).toBe(0);
      expect(pot.version).toBe(0);
    });
  });

  describe("ensurePot", () => {
    it("creates pot if not exists", async () => {
      const pot = await ensurePot("table-2", "hand-2");

      expect(pot.potId).toBe("table-2:hand-2");
      expect(pot.status).toBe("ACTIVE");
    });

    it("returns existing pot", async () => {
      await createPot("table-3", "hand-3");
      await recordContribution("table-3", "hand-3", 0, "user-1", 100, "BET", "contrib-1");

      const pot = await ensurePot("table-3", "hand-3");

      expect(pot.contributions[0]).toBe(100);
    });
  });

  describe("recordContribution", () => {
    it("records bet contribution", async () => {
      await createPot("table-4", "hand-4");

      const result = await recordContribution(
        "table-4",
        "hand-4",
        0,
        "user-1",
        100,
        "BET",
        "contrib-2"
      );

      expect(result.ok).toBe(true);
      expect(result.totalPot).toBe(100);
      expect(result.seatContribution).toBe(100);
    });

    it("accumulates contributions from same seat", async () => {
      await createPot("table-5", "hand-5");

      await recordContribution("table-5", "hand-5", 0, "user-1", 50, "BLIND", "contrib-3");
      const result = await recordContribution("table-5", "hand-5", 0, "user-1", 100, "RAISE", "contrib-4");

      expect(result.ok).toBe(true);
      expect(result.totalPot).toBe(150);
      expect(result.seatContribution).toBe(150);
    });

    it("tracks contributions from multiple seats", async () => {
      await createPot("table-6", "hand-6");

      await recordContribution("table-6", "hand-6", 0, "user-1", 100, "BET", "contrib-5");
      await recordContribution("table-6", "hand-6", 1, "user-2", 100, "CALL", "contrib-6");
      const result = await recordContribution("table-6", "hand-6", 2, "user-3", 200, "RAISE", "contrib-7");

      expect(result.totalPot).toBe(400);

      const pot = await getPotState("table-6", "hand-6");
      expect(pot!.contributions[0]).toBe(100);
      expect(pot!.contributions[1]).toBe(100);
      expect(pot!.contributions[2]).toBe(200);
    });

    it("is idempotent with same key", async () => {
      await createPot("table-7", "hand-7");
      const key = "idempotent-contrib";

      const result1 = await recordContribution("table-7", "hand-7", 0, "user-1", 100, "BET", key);
      const result2 = await recordContribution("table-7", "hand-7", 0, "user-1", 100, "BET", key);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.totalPot).toBe(result2.totalPot);

      const pot = await getPotState("table-7", "hand-7");
      expect(pot!.contributions[0]).toBe(100); // Only counted once
    });

    it("rejects contribution to non-active pot", async () => {
      await createPot("table-8", "hand-8");
      await settlePot("table-8", "hand-8", [], "settle-1");

      const result = await recordContribution(
        "table-8",
        "hand-8",
        0,
        "user-1",
        100,
        "BET",
        "contrib-8"
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("POT_NOT_ACTIVE");
    });
  });

  describe("calculatePots", () => {
    it("calculates single pot with no all-ins", () => {
      const contributions = { 0: 100, 1: 100, 2: 100 };
      const folded = new Set<number>();

      const pots = calculatePots(contributions, folded);

      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(300);
      expect(pots[0].eligibleSeatIds).toEqual([0, 1, 2]);
    });

    it("excludes folded players from eligibility", () => {
      const contributions = { 0: 100, 1: 100, 2: 100 };
      const folded = new Set<number>([1]);

      const pots = calculatePots(contributions, folded);

      expect(pots).toHaveLength(1);
      expect(pots[0].amount).toBe(300);
      expect(pots[0].eligibleSeatIds).toEqual([0, 2]);
    });

    it("calculates side pot for all-in player", () => {
      const contributions = { 0: 50, 1: 100, 2: 100 }; // seat 0 all-in for 50
      const folded = new Set<number>();

      const pots = calculatePots(contributions, folded);

      expect(pots).toHaveLength(2);

      // Main pot: 50 * 3 = 150 (all players eligible)
      expect(pots[0].amount).toBe(150);
      expect(pots[0].eligibleSeatIds).toEqual([0, 1, 2]);

      // Side pot: 50 * 2 = 100 (only players who contributed more)
      expect(pots[1].amount).toBe(100);
      expect(pots[1].eligibleSeatIds).toEqual([1, 2]);
    });

    it("calculates multiple side pots", () => {
      // seat 0: all-in 30, seat 1: all-in 70, seat 2: 100
      const contributions = { 0: 30, 1: 70, 2: 100 };
      const folded = new Set<number>();

      const pots = calculatePots(contributions, folded);

      expect(pots).toHaveLength(3);

      // Main pot: 30 * 3 = 90
      expect(pots[0].amount).toBe(90);
      expect(pots[0].eligibleSeatIds).toEqual([0, 1, 2]);

      // Side pot 1: 40 * 2 = 80
      expect(pots[1].amount).toBe(80);
      expect(pots[1].eligibleSeatIds).toEqual([1, 2]);

      // Side pot 2: 30 * 1 = 30
      expect(pots[2].amount).toBe(30);
      expect(pots[2].eligibleSeatIds).toEqual([2]);
    });

    it("handles all players folding except one", () => {
      const contributions = { 0: 50, 1: 100, 2: 100 };
      const folded = new Set<number>([1, 2]);

      const pots = calculatePots(contributions, folded);

      // Only seat 0 is eligible
      expect(pots[0].eligibleSeatIds).toEqual([0]);
    });

    it("returns empty for no contributions", () => {
      const contributions = {};
      const folded = new Set<number>();

      const pots = calculatePots(contributions, folded);

      expect(pots).toHaveLength(0);
    });
  });

  describe("settlePot", () => {
    it("settles pot and credits winners", async () => {
      await ensureAccount("winner-1", 0);
      await createPot("table-9", "hand-9");
      await recordContribution("table-9", "hand-9", 0, "winner-1", 100, "BET", "contrib-9");
      await recordContribution("table-9", "hand-9", 1, "loser-1", 100, "CALL", "contrib-10");

      const result = await settlePot(
        "table-9",
        "hand-9",
        [{ seatId: 0, accountId: "winner-1", amount: 200 }],
        "settle-2"
      );

      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results![0].amount).toBe(195);
      expect(result.results![0].newBalance).toBe(195);

      const balance = await getBalance("winner-1");
      expect(balance!.balance).toBe(195);
    });

    it("settles split pot", async () => {
      await ensureAccount("winner-2", 0);
      await ensureAccount("winner-3", 0);
      await createPot("table-10", "hand-10");
      await recordContribution("table-10", "hand-10", 0, "winner-2", 150, "BET", "contrib-10a");
      await recordContribution("table-10", "hand-10", 1, "winner-3", 150, "CALL", "contrib-10b");

      const result = await settlePot(
        "table-10",
        "hand-10",
        [
          { seatId: 0, accountId: "winner-2", amount: 150 },
          { seatId: 1, accountId: "winner-3", amount: 150 },
        ],
        "settle-3"
      );

      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(2);

      expect((await getBalance("winner-2"))!.balance).toBe(148);
      expect((await getBalance("winner-3"))!.balance).toBe(147);
    });

    it("is idempotent with same key", async () => {
      await ensureAccount("winner-4", 0);
      await createPot("table-11", "hand-11");
      await recordContribution("table-11", "hand-11", 0, "winner-4", 300, "BET", "contrib-11");

      const key = "idempotent-settle";
      const winners = [{ seatId: 0, accountId: "winner-4", amount: 300 }];

      const result1 = await settlePot("table-11", "hand-11", winners, key);
      const result2 = await settlePot("table-11", "hand-11", winners, key);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      const balance = await getBalance("winner-4");
      expect(balance!.balance).toBe(295); // Only credited once
    });

    it("fails for non-existent pot", async () => {
      const result = await settlePot(
        "nonexistent",
        "hand",
        [{ seatId: 0, accountId: "user", amount: 100 }],
        "settle-4"
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("POT_NOT_FOUND");
    });

    it("returns success for already settled pot (idempotent)", async () => {
      await ensureAccount("winner-5", 0);
      await createPot("table-12", "hand-12");
      await settlePot("table-12", "hand-12", [], "settle-5");

      // Second settle with different key still succeeds (pot already settled)
      const result = await settlePot(
        "table-12",
        "hand-12",
        [{ seatId: 0, accountId: "winner-5", amount: 100 }],
        "settle-6"
      );

      // Service returns success to prevent duplicate error handling
      expect(result.ok).toBe(true);
      expect(result.results).toEqual([]);

      // But winner-5 shouldn't receive any funds (empty results)
      const balance = await getBalance("winner-5");
      expect(balance!.balance).toBe(0);
    });

    it("marks pot as settled", async () => {
      await createPot("table-13", "hand-13");
      await settlePot("table-13", "hand-13", [], "settle-7");

      const pot = await getPotState("table-13", "hand-13");
      expect(pot!.status).toBe("SETTLED");
      expect(pot!.settledAt).toBeDefined();
    });
  });

  describe("cancelPot", () => {
    it("cancels active pot", async () => {
      await createPot("table-14", "hand-14");

      const result = await cancelPot("table-14", "hand-14", "table_disbanded");

      expect(result.ok).toBe(true);

      const pot = await getPotState("table-14", "hand-14");
      expect(pot!.status).toBe("CANCELLED");
    });

    it("fails for non-existent pot", async () => {
      const result = await cancelPot("nonexistent", "hand", "reason");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("POT_NOT_FOUND");
    });

    it("fails for already settled pot", async () => {
      await createPot("table-15", "hand-15");
      await settlePot("table-15", "hand-15", [], "settle-8");

      const result = await cancelPot("table-15", "hand-15", "reason");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("POT_NOT_ACTIVE");
    });
  });

  describe("getPotState", () => {
    it("returns null for non-existent pot", async () => {
      const pot = await getPotState("nonexistent", "hand");
      expect(pot).toBeNull();
    });

    it("returns pot state", async () => {
      await createPot("table-16", "hand-16");
      await recordContribution("table-16", "hand-16", 0, "user", 100, "BET", "contrib-11");

      const pot = await getPotState("table-16", "hand-16");

      expect(pot).not.toBeNull();
      expect(pot!.contributions[0]).toBe(100);
    });
  });

  describe("realistic hand scenarios", () => {
    it("heads-up hand with winner", async () => {
      await ensureAccount("player-a", 0);
      await ensureAccount("player-b", 0);
      await createPot("game-1", "hand-1");

      // Blinds
      await recordContribution("game-1", "hand-1", 0, "player-a", 5, "BLIND", "blind-sb");
      await recordContribution("game-1", "hand-1", 1, "player-b", 10, "BLIND", "blind-bb");

      // Preflop: Player A raises, Player B calls
      await recordContribution("game-1", "hand-1", 0, "player-a", 25, "RAISE", "preflop-raise");
      await recordContribution("game-1", "hand-1", 1, "player-b", 20, "CALL", "preflop-call");

      // Flop: Check-check
      // Turn: Player A bets, Player B calls
      await recordContribution("game-1", "hand-1", 0, "player-a", 40, "BET", "turn-bet");
      await recordContribution("game-1", "hand-1", 1, "player-b", 40, "CALL", "turn-call");

      // River: Player A bets, Player B folds - Player A wins
      await recordContribution("game-1", "hand-1", 0, "player-a", 80, "BET", "river-bet");

      const pot = await getPotState("game-1", "hand-1");
      expect(pot!.contributions[0]).toBe(150); // 5 + 25 + 40 + 80
      expect(pot!.contributions[1]).toBe(70);  // 10 + 20 + 40

      // Settle to Player A
      await settlePot(
        "game-1",
        "hand-1",
        [{ seatId: 0, accountId: "player-a", amount: 220 }],
        "settle-game1"
      );

      expect((await getBalance("player-a"))!.balance).toBe(215);
    });

    it("three-way pot with side pot", async () => {
      await ensureAccount("player-c", 0);
      await ensureAccount("player-d", 0);
      await ensureAccount("player-e", 0);
      await createPot("game-2", "hand-2");

      // All-in scenario:
      // Player C: all-in 50
      // Player D: all-in 100
      // Player E: calls 100
      await recordContribution("game-2", "hand-2", 0, "player-c", 50, "ALLIN", "c-allin");
      await recordContribution("game-2", "hand-2", 1, "player-d", 100, "ALLIN", "d-allin");
      await recordContribution("game-2", "hand-2", 2, "player-e", 100, "CALL", "e-call");

      // Player C wins main pot (50*3=150), Player E wins side pot (50*2=100)
      await settlePot(
        "game-2",
        "hand-2",
        [
          { seatId: 0, accountId: "player-c", amount: 150 },
          { seatId: 2, accountId: "player-e", amount: 100 },
        ],
        "settle-game2"
      );

      expect((await getBalance("player-c"))!.balance).toBe(147);
      expect((await getBalance("player-e"))!.balance).toBe(98);
    });
  });
});
