import { describe, expect, it, beforeEach } from "vitest";

import { processDeposit, processWithdrawal, getBalance, ensureAccount } from "../../src/services/accountService";
import {
  reserveForBuyIn,
  commitReservation,
  releaseReservation,
  processExpiredReservations,
  getAccountReservations,
} from "../../src/services/reservationService";
import {
  createPot,
  recordContribution,
  settlePot,
  calculatePots,
  getPotState,
} from "../../src/services/tablePotService";
import { resetAccounts } from "../../src/storage/accountStore";
import { resetTransactions } from "../../src/storage/transactionStore";
import { resetReservations } from "../../src/storage/reservationStore";
import { resetIdempotency } from "../../src/storage/idempotencyStore";
import { resetLedger } from "../../src/storage/ledgerStore";
import { resetTablePots } from "../../src/storage/tablePotStore";

describe("End-to-End Balance Flows", () => {
  beforeEach(async () => {
    await resetAccounts();
    await resetTransactions();
    await resetReservations();
    await resetIdempotency();
    await resetLedger();
    await resetTablePots();
  });

  describe("Two-Phase Buy-In Flow", () => {
    it("completes full buy-in cycle: reserve → commit", async () => {
      // Setup: Player has funds
      await ensureAccount("player-1", 0);
      await processDeposit("player-1", 10000, "PURCHASE", "setup-deposit");

      // Phase 1: Reserve funds for buy-in
      const reserveResult = await reserveForBuyIn(
        "player-1",
        "table-abc",
        1000,
        "reserve-key-1",
        30
      );

      expect(reserveResult.ok).toBe(true);
      expect(reserveResult.reservationId).toBeDefined();
      expect(reserveResult.availableBalance).toBe(9000); // 10000 - 1000 held

      // Balance unchanged, but available reduced
      const balance1 = await getBalance("player-1");
      expect(balance1!.balance).toBe(10000); // Still has full balance
      expect(balance1!.balance - balance1!.availableBalance).toBe(1000); // reserved
      expect(balance1!.availableBalance).toBe(9000);

      // Phase 2: Commit reservation (player seated successfully)
      const commitResult = await commitReservation(reserveResult.reservationId!);

      expect(commitResult.ok).toBe(true);
      expect(commitResult.newBalance).toBe(9000);

      // Balance now reduced
      const balance2 = await getBalance("player-1");
      expect(balance2!.balance).toBe(9000);
      expect(balance2!.balance - balance2!.availableBalance).toBe(0); // no reserved
      expect(balance2!.availableBalance).toBe(9000);
    });

    it("handles buy-in cancellation: reserve → release", async () => {
      // Setup: Player has funds
      await ensureAccount("player-2", 0);
      await processDeposit("player-2", 5000, "PURCHASE", "setup-deposit-2");

      // Phase 1: Reserve funds
      const reserveResult = await reserveForBuyIn(
        "player-2",
        "table-xyz",
        2000,
        "reserve-key-2"
      );

      expect(reserveResult.ok).toBe(true);
      expect(reserveResult.availableBalance).toBe(3000);

      // Phase 2: Release (table full, seat taken, etc.)
      const releaseResult = await releaseReservation(
        reserveResult.reservationId!,
        "seat_taken"
      );

      expect(releaseResult.ok).toBe(true);
      expect(releaseResult.availableBalance).toBe(5000); // Full balance available again

      // Verify no balance change
      const balance = await getBalance("player-2");
      expect(balance!.balance).toBe(5000);
      expect(balance!.balance - balance!.availableBalance).toBe(0); // no reserved
    });

    it("handles reservation timeout gracefully", async () => {
      // Setup
      await ensureAccount("player-3", 0);
      await processDeposit("player-3", 1000, "PURCHASE", "setup-3");

      // Create reservation with very short timeout
      const reserveResult = await reserveForBuyIn(
        "player-3",
        "table-timeout",
        500,
        "reserve-timeout",
        0 // 0 second timeout (will be expired immediately for testing)
      );

      expect(reserveResult.ok).toBe(true);

      // Wait a tick and process expired
      await new Promise((r) => setTimeout(r, 10));
      const expiredCount = await processExpiredReservations();
      expect(expiredCount).toBeGreaterThan(0);

      // Try to commit - should fail (may be EXPIRED or NOT_HELD depending on timing)
      const commitResult = await commitReservation(reserveResult.reservationId!);
      expect(commitResult.ok).toBe(false);
      expect(["RESERVATION_EXPIRED", "RESERVATION_NOT_HELD"]).toContain(commitResult.error);

      // Balance should be fully available again
      const balance = await getBalance("player-3");
      expect(balance!.balance - balance!.availableBalance).toBe(0); // no reserved
      expect(balance!.availableBalance).toBe(1000);
    });

    it("prevents double-commit of same reservation", async () => {
      await ensureAccount("player-4", 0);
      await processDeposit("player-4", 2000, "PURCHASE", "setup-4");

      const reserveResult = await reserveForBuyIn(
        "player-4",
        "table-double",
        1000,
        "reserve-double"
      );

      // First commit succeeds
      const commit1 = await commitReservation(reserveResult.reservationId!);
      expect(commit1.ok).toBe(true);

      // Second commit is idempotent - returns success but doesn't debit again
      const commit2 = await commitReservation(reserveResult.reservationId!);
      expect(commit2.ok).toBe(true);

      // Balance only debited once
      const balance = await getBalance("player-4");
      expect(balance!.balance).toBe(1000);
    });

    it("handles sequential reservation commits", async () => {
      await ensureAccount("player-5", 0);
      await processDeposit("player-5", 10000, "PURCHASE", "setup-5");

      // Player reserves for first table
      const reserve1 = await reserveForBuyIn("player-5", "table-1", 3000, "res-t1");
      expect(reserve1.ok).toBe(true);

      // Commit first reservation immediately (this works with current implementation)
      const commit1 = await commitReservation(reserve1.reservationId!);
      expect(commit1.ok).toBe(true);
      expect(commit1.newBalance).toBe(7000);

      // Now reserve for second table
      const reserve2 = await reserveForBuyIn("player-5", "table-2", 3000, "res-t2");
      expect(reserve2.ok).toBe(true);

      // Commit second reservation
      const commit2 = await commitReservation(reserve2.reservationId!);
      expect(commit2.ok).toBe(true);
      expect(commit2.newBalance).toBe(4000);

      // Reserve third and release without committing
      const reserve3 = await reserveForBuyIn("player-5", "table-3", 3000, "res-t3");
      expect(reserve3.ok).toBe(true);
      expect(reserve3.availableBalance).toBe(1000);

      await releaseReservation(reserve3.reservationId!);

      const balance = await getBalance("player-5");
      expect(balance!.balance).toBe(4000); // 10000 - 3000 - 3000
      expect(balance!.balance - balance!.availableBalance).toBe(0); // no reserved
    });
  });

  describe("Complete Poker Hand Flow", () => {
    it("simulates full hand with betting rounds and pot settlement", async () => {
      // Setup: 3 players at table, each bought in
      const players = ["alice", "bob", "charlie"];
      for (const player of players) {
        await ensureAccount(player, 0);
        await processDeposit(player, 1000, "PURCHASE", `setup-${player}`);
      }

      // Start hand
      const tableId = "table-hand-1";
      const handId = "hand-001";
      await createPot(tableId, handId);

      // Blinds: alice (SB=5), bob (BB=10)
      await recordContribution(tableId, handId, 0, "alice", 5, "BLIND", "sb-1");
      await recordContribution(tableId, handId, 1, "bob", 10, "BLIND", "bb-1");

      // Preflop: charlie raises to 30, alice calls, bob calls
      await recordContribution(tableId, handId, 2, "charlie", 30, "RAISE", "pf-charlie");
      await recordContribution(tableId, handId, 0, "alice", 25, "CALL", "pf-alice"); // 5 more to call 30
      await recordContribution(tableId, handId, 1, "bob", 20, "CALL", "pf-bob"); // 20 more to call 30

      // Pot now: 90 (30 + 30 + 30)
      let potState = await getPotState(tableId, handId);
      expect(potState!.contributions[0]).toBe(30);
      expect(potState!.contributions[1]).toBe(30);
      expect(potState!.contributions[2]).toBe(30);

      // Flop: charlie bets 50, alice raises to 150, bob folds, charlie calls
      await recordContribution(tableId, handId, 2, "charlie", 50, "BET", "flop-bet");
      await recordContribution(tableId, handId, 0, "alice", 150, "RAISE", "flop-raise");
      // bob folds (no more contributions)
      await recordContribution(tableId, handId, 2, "charlie", 100, "CALL", "flop-call"); // 100 more to match 150

      // Turn & River: Check through
      // No more contributions

      // Final contributions: alice=180, bob=30, charlie=180
      // Total pot: 390
      potState = await getPotState(tableId, handId);
      expect(potState!.contributions[0]).toBe(180);
      expect(potState!.contributions[1]).toBe(30);
      expect(potState!.contributions[2]).toBe(180);

      // Alice wins with best hand
      const settleResult = await settlePot(
        tableId,
        handId,
        [{ seatId: 0, accountId: "alice", amount: 390 }],
        "settle-hand-1"
      );

      expect(settleResult.ok).toBe(true);
      expect(settleResult.results).toHaveLength(1);
      expect(settleResult.results![0].newBalance).toBe(1000 + 385);

      // Verify final balances
      const aliceBalance = await getBalance("alice");
      const bobBalance = await getBalance("bob");
      const charlieBalance = await getBalance("charlie");

      expect(aliceBalance!.balance).toBe(1385); // Won 385 after rake
      expect(bobBalance!.balance).toBe(1000);  // Didn't spend from account (pot is tracked separately)
      expect(charlieBalance!.balance).toBe(1000); // Same
    });

    it("handles split pot scenario", async () => {
      await ensureAccount("player-a", 0);
      await ensureAccount("player-b", 0);
      await processDeposit("player-a", 500, "PURCHASE", "setup-a");
      await processDeposit("player-b", 500, "PURCHASE", "setup-b");

      const tableId = "table-split";
      const handId = "hand-split";
      await createPot(tableId, handId);

      // Both players go all-in preflop
      await recordContribution(tableId, handId, 0, "player-a", 500, "ALLIN", "allin-a");
      await recordContribution(tableId, handId, 1, "player-b", 500, "ALLIN", "allin-b");

      // Split pot - both have same hand
      const settleResult = await settlePot(
        tableId,
        handId,
        [
          { seatId: 0, accountId: "player-a", amount: 500 },
          { seatId: 1, accountId: "player-b", amount: 500 },
        ],
        "settle-split"
      );

      expect(settleResult.ok).toBe(true);

      expect((await getBalance("player-a"))!.balance).toBe(998);
      expect((await getBalance("player-b"))!.balance).toBe(997);
    });

    it("handles complex side pot scenario", async () => {
      // Three players with different stack sizes
      await ensureAccount("short", 0);
      await ensureAccount("medium", 0);
      await ensureAccount("deep", 0);

      await processDeposit("short", 100, "PURCHASE", "setup-short");
      await processDeposit("medium", 300, "PURCHASE", "setup-medium");
      await processDeposit("deep", 500, "PURCHASE", "setup-deep");

      const tableId = "table-sidepot";
      const handId = "hand-sidepot";
      await createPot(tableId, handId);

      // All-in sequence:
      // Short stack goes all-in for 100
      // Medium stack calls (100) then goes all-in for remaining 200 (total 300)
      // Deep stack calls all (300)
      await recordContribution(tableId, handId, 0, "short", 100, "ALLIN", "short-allin");
      await recordContribution(tableId, handId, 1, "medium", 300, "ALLIN", "medium-allin");
      await recordContribution(tableId, handId, 2, "deep", 300, "CALL", "deep-call");

      // Calculate side pots
      const potState = await getPotState(tableId, handId);
      const pots = calculatePots(potState!.contributions, new Set());

      // Main pot: 100 * 3 = 300 (all three eligible)
      // Side pot: 200 * 2 = 400 (medium and deep eligible)
      expect(pots).toHaveLength(2);
      expect(pots[0].amount).toBe(300);
      expect(pots[0].eligibleSeatIds).toEqual([0, 1, 2]);
      expect(pots[1].amount).toBe(400);
      expect(pots[1].eligibleSeatIds).toEqual([1, 2]);

      // Short wins main pot, deep wins side pot
      const settleResult = await settlePot(
        tableId,
        handId,
        [
          { seatId: 0, accountId: "short", amount: 300 },  // Main pot
          { seatId: 2, accountId: "deep", amount: 400 },   // Side pot
        ],
        "settle-sidepot"
      );

      expect(settleResult.ok).toBe(true);

      expect((await getBalance("short"))!.balance).toBe(398);  // Started 100, won 298
      expect((await getBalance("medium"))!.balance).toBe(300); // Unchanged (lost all, pot tracked separately)
      expect((await getBalance("deep"))!.balance).toBe(897);   // Started 500, won 397
    });
  });

  describe("Cash-Out Flow", () => {
    it("handles complete cash-out when leaving table", async () => {
      await ensureAccount("cashout-player", 0);
      await processDeposit("cashout-player", 1000, "PURCHASE", "setup-cashout");

      // Simulate winning some hands (balance increases)
      await processDeposit("cashout-player", 500, "WINNINGS", "winnings-1");
      await processDeposit("cashout-player", 300, "WINNINGS", "winnings-2");

      let balance = await getBalance("cashout-player");
      expect(balance!.balance).toBe(1800);

      // Player leaves table - cash out
      const withdrawResult = await processWithdrawal(
        "cashout-player",
        1800,
        "cashout-all",
        "leaving_table"
      );

      expect(withdrawResult.ok).toBe(true);
      expect(withdrawResult.transaction!.balanceAfter).toBe(0);

      balance = await getBalance("cashout-player");
      expect(balance!.balance).toBe(0);
    });

    it("prevents cash-out with active reservation", async () => {
      await ensureAccount("held-player", 0);
      await processDeposit("held-player", 2000, "PURCHASE", "setup-held");

      // Create a reservation (buying into another table)
      const reserveResult = await reserveForBuyIn(
        "held-player",
        "table-new",
        1000,
        "reserve-new"
      );
      expect(reserveResult.ok).toBe(true);

      // Try to withdraw more than available (should fail)
      const withdrawResult = await processWithdrawal(
        "held-player",
        1500, // More than available (only 1000 available)
        "over-withdraw"
      );

      expect(withdrawResult.ok).toBe(false);
      expect(withdrawResult.error).toBe("INSUFFICIENT_BALANCE");

      // Can withdraw up to available amount
      const validWithdraw = await processWithdrawal(
        "held-player",
        1000,
        "valid-withdraw"
      );
      expect(validWithdraw.ok).toBe(true);
    });
  });

  describe("Realistic Multi-Table Session", () => {
    it("simulates player playing multiple tables simultaneously", async () => {
      await ensureAccount("multi-table-player", 0);
      await processDeposit("multi-table-player", 5000, "PURCHASE", "initial-purchase");

      // Buy into 3 tables
      const table1Reserve = await reserveForBuyIn("multi-table-player", "table-1", 1000, "buy-t1");
      const table2Reserve = await reserveForBuyIn("multi-table-player", "table-2", 1000, "buy-t2");
      const table3Reserve = await reserveForBuyIn("multi-table-player", "table-3", 1000, "buy-t3");

      // All should succeed
      expect(table1Reserve.ok).toBe(true);
      expect(table2Reserve.ok).toBe(true);
      expect(table3Reserve.ok).toBe(true);

      // Commit all buy-ins
      await commitReservation(table1Reserve.reservationId!);
      await commitReservation(table2Reserve.reservationId!);
      await commitReservation(table3Reserve.reservationId!);

      // Balance reduced by 3000
      let balance = await getBalance("multi-table-player");
      expect(balance!.balance).toBe(2000);

      // Play hands - simulate winning at table 1, losing at table 2, even at table 3
      await processDeposit("multi-table-player", 1500, "WINNINGS", "win-t1"); // Won 1500
      // Table 2: lost buy-in (no deposit back)
      await processDeposit("multi-table-player", 1000, "WINNINGS", "even-t3"); // Got back buy-in

      balance = await getBalance("multi-table-player");
      expect(balance!.balance).toBe(4500); // 2000 + 1500 + 1000

      // Cash out partial
      await processWithdrawal("multi-table-player", 2000, "partial-cashout");

      balance = await getBalance("multi-table-player");
      expect(balance!.balance).toBe(2500);
    });
  });

  describe("Error Recovery Scenarios", () => {
    it("handles idempotent reservation retries", async () => {
      await ensureAccount("error-test", 0);
      await processDeposit("error-test", 1000, "PURCHASE", "setup-err");

      // Start a reservation
      const reserve = await reserveForBuyIn("error-test", "table-err", 400, "res-err");
      expect(reserve.ok).toBe(true);

      // Simulate "network error" - retry the same reservation (idempotency check)
      const retryReserve = await reserveForBuyIn("error-test", "table-err", 400, "res-err");
      expect(retryReserve.ok).toBe(true);
      expect(retryReserve.reservationId).toBe(reserve.reservationId);

      // Only one reservation created
      const reservations = await getAccountReservations("error-test");
      expect(reservations.filter((r) => r.status === "HELD")).toHaveLength(1);

      // Commit succeeds
      const commitResult = await commitReservation(reserve.reservationId!);
      expect(commitResult.ok).toBe(true);

      // Balance correctly reflects single debit
      const balance = await getBalance("error-test");
      expect(balance!.balance).toBe(600); // 1000 - 400
    });

    it("handles deposit retry after simulated failure", async () => {
      await ensureAccount("retry-test", 0);

      // First attempt "fails" but might have been processed
      const key = "maybe-processed";
      await processDeposit("retry-test", 500, "PURCHASE", key);

      // Retry with same key
      const retry = await processDeposit("retry-test", 500, "PURCHASE", key);
      expect(retry.ok).toBe(true);

      // Only deposited once
      const balance = await getBalance("retry-test");
      expect(balance!.balance).toBe(500);
    });
  });

  describe("Balance Invariant Tests", () => {
    it("maintains balance + reserved = original after reservation operations", async () => {
      await ensureAccount("invariant-test", 0);
      await processDeposit("invariant-test", 1000, "PURCHASE", "setup-inv");

      // Initial state
      let balance = await getBalance("invariant-test");
      const originalTotal = balance!.balance;
      expect(originalTotal).toBe(1000);

      // Create multiple reservations
      await reserveForBuyIn("invariant-test", "t1", 200, "inv-r1");
      await reserveForBuyIn("invariant-test", "t2", 300, "inv-r2");

      balance = await getBalance("invariant-test");
      const reservedAmount = balance!.balance - balance!.availableBalance;
      expect(balance!.balance).toBe(originalTotal);
      expect(balance!.balance).toBe(1000); // Balance unchanged
      expect(reservedAmount).toBe(500); // 200 + 300 reserved
      expect(balance!.availableBalance).toBe(500);

      // Sum of available + reserved should equal total balance
      expect(balance!.availableBalance + reservedAmount).toBe(originalTotal);
    });

    it("pot contributions match settlement amounts", async () => {
      await ensureAccount("pot-inv-1", 0);
      await ensureAccount("pot-inv-2", 0);

      await createPot("pot-inv-table", "pot-inv-hand");

      // Record contributions
      await recordContribution("pot-inv-table", "pot-inv-hand", 0, "pot-inv-1", 100, "BET", "c1");
      await recordContribution("pot-inv-table", "pot-inv-hand", 1, "pot-inv-2", 100, "CALL", "c2");
      await recordContribution("pot-inv-table", "pot-inv-hand", 0, "pot-inv-1", 200, "RAISE", "c3");
      await recordContribution("pot-inv-table", "pot-inv-hand", 1, "pot-inv-2", 200, "CALL", "c4");

      const pot = await getPotState("pot-inv-table", "pot-inv-hand");
      const totalContributions = Object.values(pot!.contributions).reduce(
        (sum: number, c: number) => sum + c,
        0
      );

      // Total is 600 (300 + 300)
      expect(totalContributions).toBe(600);

      // Settlement must equal contributions
      const settleResult = await settlePot(
        "pot-inv-table",
        "pot-inv-hand",
        [{ seatId: 0, accountId: "pot-inv-1", amount: 600 }],
        "settle-pot-inv"
      );

      expect(settleResult.ok).toBe(true);
      expect(settleResult.results![0].amount).toBe(595);
    });
  });
});
