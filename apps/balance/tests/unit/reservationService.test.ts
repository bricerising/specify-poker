import { describe, expect, it, beforeEach } from "vitest";
import {
  reserveForBuyIn,
  commitReservation,
  releaseReservation,
  processExpiredReservations,
  getAccountReservations,
} from "../../src/services/reservationService";
import { ensureAccount, getBalance } from "../../src/services/accountService";
import { resetAccounts } from "../../src/storage/accountStore";
import { resetTransactions } from "../../src/storage/transactionStore";
import { resetReservations } from "../../src/storage/reservationStore";
import { resetIdempotency } from "../../src/storage/idempotencyStore";
import { resetLedger } from "../../src/storage/ledgerStore";

describe("reservationService", () => {
  beforeEach(async () => {
    await resetAccounts();
    await resetTransactions();
    await resetReservations();
    await resetIdempotency();
    await resetLedger();
  });

  describe("reserveForBuyIn", () => {
    it("reserves funds for buy-in", async () => {
      await ensureAccount("user-1", 1000);

      const result = await reserveForBuyIn(
        "user-1",
        "table-1",
        500,
        "reserve-1"
      );

      expect(result.ok).toBe(true);
      expect(result.reservationId).toBeDefined();
      expect(result.availableBalance).toBe(500);

      const balance = await getBalance("user-1");
      expect(balance!.balance).toBe(1000); // Not yet deducted
      expect(balance!.availableBalance).toBe(500); // But reserved
    });

    it("rejects reservation with insufficient balance", async () => {
      await ensureAccount("user-2", 100);

      const result = await reserveForBuyIn(
        "user-2",
        "table-1",
        500,
        "reserve-2"
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("INSUFFICIENT_BALANCE");
      expect(result.availableBalance).toBe(100);
    });

    it("rejects reservation for non-existent account", async () => {
      const result = await reserveForBuyIn(
        "nonexistent",
        "table-1",
        500,
        "reserve-3"
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("ACCOUNT_NOT_FOUND");
    });

    it("allows multiple reservations if balance permits", async () => {
      await ensureAccount("user-3", 1000);

      const result1 = await reserveForBuyIn("user-3", "table-1", 300, "reserve-4");
      const result2 = await reserveForBuyIn("user-3", "table-2", 300, "reserve-5");

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      const balance = await getBalance("user-3");
      expect(balance!.availableBalance).toBe(400);
    });

    it("rejects reservation when available balance exhausted", async () => {
      await ensureAccount("user-4", 500);

      const result1 = await reserveForBuyIn("user-4", "table-1", 300, "reserve-6");
      const result2 = await reserveForBuyIn("user-4", "table-2", 300, "reserve-7");

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(false);
      expect(result2.error).toBe("INSUFFICIENT_BALANCE");
    });

    it("is idempotent with same key", async () => {
      await ensureAccount("user-5", 1000);
      const key = "idempotent-reserve";

      const result1 = await reserveForBuyIn("user-5", "table-1", 500, key);
      const result2 = await reserveForBuyIn("user-5", "table-1", 500, key);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.reservationId).toBe(result2.reservationId);

      const balance = await getBalance("user-5");
      expect(balance!.availableBalance).toBe(500); // Only one reservation
    });
  });

  describe("commitReservation", () => {
    it("commits reservation and deducts balance", async () => {
      await ensureAccount("user-6", 1000);

      const reserve = await reserveForBuyIn("user-6", "table-1", 500, "reserve-8");
      const commit = await commitReservation(reserve.reservationId!);

      expect(commit.ok).toBe(true);
      expect(commit.transactionId).toBeDefined();
      expect(commit.newBalance).toBe(500);

      const balance = await getBalance("user-6");
      expect(balance!.balance).toBe(500);
      expect(balance!.availableBalance).toBe(500);
    });

    it("returns error for non-existent reservation", async () => {
      const result = await commitReservation("nonexistent-reservation");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("RESERVATION_NOT_FOUND");
    });

    it("is idempotent for already committed reservation", async () => {
      await ensureAccount("user-7", 1000);

      const reserve = await reserveForBuyIn("user-7", "table-1", 500, "reserve-9");
      const commit1 = await commitReservation(reserve.reservationId!);
      const commit2 = await commitReservation(reserve.reservationId!);

      expect(commit1.ok).toBe(true);
      expect(commit2.ok).toBe(true);

      const balance = await getBalance("user-7");
      expect(balance!.balance).toBe(500); // Only deducted once
    });
  });

  describe("releaseReservation", () => {
    it("releases reservation and restores available balance", async () => {
      await ensureAccount("user-8", 1000);

      const reserve = await reserveForBuyIn("user-8", "table-1", 500, "reserve-10");
      expect((await getBalance("user-8"))!.availableBalance).toBe(500);

      const release = await releaseReservation(reserve.reservationId!, "test");

      expect(release.ok).toBe(true);
      expect(release.availableBalance).toBe(1000);

      const balance = await getBalance("user-8");
      expect(balance!.balance).toBe(1000);
      expect(balance!.availableBalance).toBe(1000);
    });

    it("returns error for non-existent reservation", async () => {
      const result = await releaseReservation("nonexistent-reservation");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("RESERVATION_NOT_FOUND");
    });

    it("is idempotent for already released reservation", async () => {
      await ensureAccount("user-9", 1000);

      const reserve = await reserveForBuyIn("user-9", "table-1", 500, "reserve-11");
      const release1 = await releaseReservation(reserve.reservationId!);
      const release2 = await releaseReservation(reserve.reservationId!);

      expect(release1.ok).toBe(true);
      expect(release2.ok).toBe(true);
    });

    it("rejects release of committed reservation", async () => {
      await ensureAccount("user-10", 1000);

      const reserve = await reserveForBuyIn("user-10", "table-1", 500, "reserve-12");
      await commitReservation(reserve.reservationId!);

      const release = await releaseReservation(reserve.reservationId!);

      expect(release.ok).toBe(false);
      expect(release.error).toBe("ALREADY_COMMITTED");
    });
  });

  describe("processExpiredReservations", () => {
    it("expires old reservations", async () => {
      await ensureAccount("user-11", 1000);

      // Create reservation with very short timeout
      const _reserve = await reserveForBuyIn(
        "user-11",
        "table-1",
        500,
        "reserve-13",
        0 // 0 second timeout = immediate expiry
      );

      expect(_reserve.ok).toBe(true);

      // Wait a bit and process expired
      await new Promise((resolve) => setTimeout(resolve, 10));
      const expiredCount = await processExpiredReservations();

      expect(expiredCount).toBe(1);

      const balance = await getBalance("user-11");
      expect(balance!.availableBalance).toBe(1000);
    });

    it("does not expire active reservations", async () => {
      await ensureAccount("user-12", 1000);

      const _reserve = await reserveForBuyIn(
        "user-12",
        "table-1",
        500,
        "reserve-14",
        60 // 60 second timeout
      );

      const expiredCount = await processExpiredReservations();

      expect(expiredCount).toBe(0);

      const balance = await getBalance("user-12");
      expect(balance!.availableBalance).toBe(500); // Still reserved
    });
  });

  describe("getAccountReservations", () => {
    it("returns active reservations for account", async () => {
      await ensureAccount("user-13", 2000);

      await reserveForBuyIn("user-13", "table-1", 500, "reserve-15");
      await reserveForBuyIn("user-13", "table-2", 300, "reserve-16");

      const reservations = await getAccountReservations("user-13");

      expect(reservations).toHaveLength(2);
      expect(reservations.map((r) => r.amount).sort()).toEqual([300, 500]);
    });

    it("excludes committed reservations", async () => {
      await ensureAccount("user-14", 1000);

      const reserve1 = await reserveForBuyIn("user-14", "table-1", 300, "reserve-17");
      const _reserve2 = await reserveForBuyIn("user-14", "table-2", 200, "reserve-18");

      await commitReservation(reserve1.reservationId!);

      const reservations = await getAccountReservations("user-14");

      expect(reservations).toHaveLength(1);
      expect(reservations[0].amount).toBe(200);
    });

    it("returns empty array for account with no reservations", async () => {
      await ensureAccount("user-15", 1000);

      const reservations = await getAccountReservations("user-15");

      expect(reservations).toHaveLength(0);
    });
  });

  describe("two-phase buy-in flow", () => {
    it("completes full reserve -> commit flow", async () => {
      await ensureAccount("player-1", 1000);

      // Phase 1: Reserve
      const reserve = await reserveForBuyIn("player-1", "poker-table", 500, "buyin-1");
      expect(reserve.ok).toBe(true);

      let balance = await getBalance("player-1");
      expect(balance!.balance).toBe(1000);
      expect(balance!.availableBalance).toBe(500);

      // Phase 2: Commit
      const commit = await commitReservation(reserve.reservationId!);
      expect(commit.ok).toBe(true);

      balance = await getBalance("player-1");
      expect(balance!.balance).toBe(500);
      expect(balance!.availableBalance).toBe(500);
    });

    it("completes full reserve -> release flow on failure", async () => {
      await ensureAccount("player-2", 1000);

      // Phase 1: Reserve
      const reserve = await reserveForBuyIn("player-2", "poker-table", 500, "buyin-2");
      expect(reserve.ok).toBe(true);

      // Simulate seat join failure
      // Phase 2: Release
      const release = await releaseReservation(reserve.reservationId!, "seat_taken");
      expect(release.ok).toBe(true);

      const balance = await getBalance("player-2");
      expect(balance!.balance).toBe(1000);
      expect(balance!.availableBalance).toBe(1000);
    });
  });
});
