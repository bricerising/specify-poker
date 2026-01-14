import { describe, expect, it, beforeEach } from "vitest";

import {
  ensureAccount,
  getAccount,
  updateAccount,
  updateAccountWithVersion,
  listAccounts,
  resetAccounts,
} from "../../src/storage/accountStore";

import {
  getTransaction,
  saveTransaction,
  updateTransaction,
  getTransactionsByAccount,
  resetTransactions,
} from "../../src/storage/transactionStore";

import {
  getReservation,
  saveReservation,
  updateReservation,
  getActiveReservationsByAccount,
  getExpiredReservations,
  resetReservations,
} from "../../src/storage/reservationStore";

import {
  getTablePot,
  saveTablePot,
  updateTablePot,
  resetTablePots,
} from "../../src/storage/tablePotStore";

import { Transaction, Reservation, TablePot } from "../../src/domain/types";

describe("Storage Layer", () => {
  beforeEach(async () => {
    await resetAccounts();
    await resetTransactions();
    await resetReservations();
    await resetTablePots();
  });

  describe("accountStore", () => {
    describe("updateAccountWithVersion", () => {
      it("fails with VERSION_CONFLICT when version mismatch", async () => {
        await ensureAccount("version-test", 100);

        // Get current version
        const account = await getAccount("version-test");
        expect(account!.version).toBe(0);

        // Update with correct version
        const result1 = await updateAccountWithVersion("version-test", 0, (acc) => ({
          ...acc,
          balance: 200,
        }));
        expect(result1.ok).toBe(true);

        // Try to update with old version
        const result2 = await updateAccountWithVersion("version-test", 0, (acc) => ({
          ...acc,
          balance: 300,
        }));
        expect(result2.ok).toBe(false);
        expect(result2.error).toBe("VERSION_CONFLICT");
      });

      it("fails for non-existent account", async () => {
        const result = await updateAccountWithVersion("nonexistent", 0, (acc) => acc);
        expect(result.ok).toBe(false);
        expect(result.error).toBe("ACCOUNT_NOT_FOUND");
      });
    });

    describe("listAccounts", () => {
      it("returns all accounts", async () => {
        await ensureAccount("list-1", 100);
        await ensureAccount("list-2", 200);
        await ensureAccount("list-3", 300);

        const accounts = await listAccounts();
        expect(accounts.length).toBe(3);
        expect(accounts.map((a) => a.accountId).sort()).toEqual(["list-1", "list-2", "list-3"]);
      });

      it("returns empty for no accounts", async () => {
        const accounts = await listAccounts();
        expect(accounts).toEqual([]);
      });
    });

    describe("updateAccount", () => {
      it("returns null for non-existent account", async () => {
        const result = await updateAccount("nonexistent", (acc) => acc);
        expect(result).toBeNull();
      });

      it("increments version on each update", async () => {
        await ensureAccount("version-inc", 100);

        let account = await getAccount("version-inc");
        expect(account!.version).toBe(0);

        await updateAccount("version-inc", (acc) => ({ ...acc, balance: 200 }));
        account = await getAccount("version-inc");
        expect(account!.version).toBe(1);

        await updateAccount("version-inc", (acc) => ({ ...acc, balance: 300 }));
        account = await getAccount("version-inc");
        expect(account!.version).toBe(2);
      });
    });
  });

  describe("transactionStore", () => {
    describe("getTransaction", () => {
      it("returns null for non-existent transaction", async () => {
        const tx = await getTransaction("nonexistent");
        expect(tx).toBeNull();
      });
    });

    describe("updateTransaction", () => {
      it("updates existing transaction", async () => {
        const tx: Transaction = {
          transactionId: "update-tx",
          idempotencyKey: "key-1",
          type: "DEPOSIT",
          accountId: "user-1",
          amount: 100,
          balanceBefore: 0,
          balanceAfter: 100,
          metadata: {},
          status: "PENDING",
          createdAt: new Date().toISOString(),
          completedAt: null,
        };

        await saveTransaction(tx);

        const updated = await updateTransaction("update-tx", (t) => ({
          ...t,
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
        }));

        expect(updated).not.toBeNull();
        expect(updated!.status).toBe("COMPLETED");
        expect(updated!.completedAt).not.toBeNull();
      });

      it("returns null for non-existent transaction", async () => {
        const result = await updateTransaction("nonexistent", (t) => t);
        expect(result).toBeNull();
      });
    });

    describe("getTransactionsByAccount", () => {
      beforeEach(async () => {
        // Create multiple transactions for testing
        for (let i = 1; i <= 10; i++) {
          const tx: Transaction = {
            transactionId: `tx-${i}`,
            idempotencyKey: `key-${i}`,
            type: i % 2 === 0 ? "DEPOSIT" : "WITHDRAW",
            accountId: "history-user",
            amount: i * 10,
            balanceBefore: 0,
            balanceAfter: i * 10,
            metadata: {},
            status: "COMPLETED",
            createdAt: new Date(Date.now() + i * 1000).toISOString(),
            completedAt: new Date(Date.now() + i * 1000).toISOString(),
          };
          await saveTransaction(tx);
        }
      });

      it("returns transactions with pagination", async () => {
        const result = await getTransactionsByAccount("history-user", { limit: 5, offset: 0 });

        expect(result.transactions.length).toBeLessThanOrEqual(5);
        expect(result.total).toBe(10);
      });

      it("supports offset pagination", async () => {
        const page1 = await getTransactionsByAccount("history-user", { limit: 3, offset: 0 });
        const page2 = await getTransactionsByAccount("history-user", { limit: 3, offset: 3 });

        // Ensure no overlap (transaction IDs should be different)
        const page1Ids = page1.transactions.map((t) => t.transactionId);
        const page2Ids = page2.transactions.map((t) => t.transactionId);

        const overlap = page1Ids.filter((id) => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      });

      it("filters by type", async () => {
        const result = await getTransactionsByAccount("history-user", { type: "DEPOSIT" });

        expect(result.transactions.every((t) => t.type === "DEPOSIT")).toBe(true);
      });

      it("returns empty for account with no transactions", async () => {
        const result = await getTransactionsByAccount("no-transactions");

        expect(result.transactions).toEqual([]);
        expect(result.total).toBe(0);
      });
    });
  });

  describe("reservationStore", () => {
    describe("getReservation", () => {
      it("returns null for non-existent reservation", async () => {
        const result = await getReservation("nonexistent");
        expect(result).toBeNull();
      });
    });

    describe("updateReservation", () => {
      it("updates existing reservation", async () => {
        const reservation: Reservation = {
          reservationId: "res-update",
          accountId: "user-1",
          amount: 100,
          tableId: "table-1",
          idempotencyKey: "key-1",
          expiresAt: new Date(Date.now() + 30000).toISOString(),
          status: "HELD",
          createdAt: new Date().toISOString(),
          committedAt: null,
          releasedAt: null,
        };

        await saveReservation(reservation);

        const updated = await updateReservation("res-update", (r) => ({
          ...r,
          status: "COMMITTED",
          committedAt: new Date().toISOString(),
        }));

        expect(updated).not.toBeNull();
        expect(updated!.status).toBe("COMMITTED");
      });

      it("returns null for non-existent reservation", async () => {
        const result = await updateReservation("nonexistent", (r) => r);
        expect(result).toBeNull();
      });
    });

    describe("getActiveReservationsByAccount", () => {
      it("returns only HELD reservations", async () => {
        const reservations: Reservation[] = [
          {
            reservationId: "res-1",
            accountId: "multi-user",
            amount: 100,
            tableId: "table-1",
            idempotencyKey: "key-1",
            expiresAt: new Date(Date.now() + 30000).toISOString(),
            status: "HELD",
            createdAt: new Date().toISOString(),
            committedAt: null,
            releasedAt: null,
          },
          {
            reservationId: "res-2",
            accountId: "multi-user",
            amount: 200,
            tableId: "table-2",
            idempotencyKey: "key-2",
            expiresAt: new Date(Date.now() + 30000).toISOString(),
            status: "COMMITTED",
            createdAt: new Date().toISOString(),
            committedAt: new Date().toISOString(),
            releasedAt: null,
          },
          {
            reservationId: "res-3",
            accountId: "multi-user",
            amount: 300,
            tableId: "table-3",
            idempotencyKey: "key-3",
            expiresAt: new Date(Date.now() + 30000).toISOString(),
            status: "HELD",
            createdAt: new Date().toISOString(),
            committedAt: null,
            releasedAt: null,
          },
        ];

        for (const res of reservations) {
          await saveReservation(res);
        }

        const active = await getActiveReservationsByAccount("multi-user");
        expect(active.length).toBe(2);
        expect(active.every((r) => r.status === "HELD")).toBe(true);
      });
    });

    describe("getExpiredReservations", () => {
      it("returns only expired HELD reservations", async () => {
        const past = Date.now() - 10000;
        const future = Date.now() + 30000;

        const reservations: Reservation[] = [
          {
            reservationId: "expired-1",
            accountId: "user-1",
            amount: 100,
            tableId: "table-1",
            idempotencyKey: "exp-key-1",
            expiresAt: new Date(past).toISOString(),
            status: "HELD",
            createdAt: new Date().toISOString(),
            committedAt: null,
            releasedAt: null,
          },
          {
            reservationId: "not-expired",
            accountId: "user-1",
            amount: 200,
            tableId: "table-2",
            idempotencyKey: "exp-key-2",
            expiresAt: new Date(future).toISOString(),
            status: "HELD",
            createdAt: new Date().toISOString(),
            committedAt: null,
            releasedAt: null,
          },
          {
            reservationId: "expired-committed",
            accountId: "user-1",
            amount: 300,
            tableId: "table-3",
            idempotencyKey: "exp-key-3",
            expiresAt: new Date(past).toISOString(),
            status: "COMMITTED",
            createdAt: new Date().toISOString(),
            committedAt: new Date().toISOString(),
            releasedAt: null,
          },
        ];

        for (const res of reservations) {
          await saveReservation(res);
        }

        const expired = await getExpiredReservations(Date.now());
        expect(expired.length).toBe(1);
        expect(expired[0].reservationId).toBe("expired-1");
      });
    });
  });

  describe("tablePotStore", () => {
    describe("getTablePot", () => {
      it("returns null for non-existent pot", async () => {
        const pot = await getTablePot("table-x", "hand-x");
        expect(pot).toBeNull();
      });
    });

    describe("updateTablePot", () => {
      it("updates existing pot", async () => {
        const pot: TablePot = {
          potId: "table-up:hand-up",
          tableId: "table-up",
          handId: "hand-up",
          contributions: {},
          pots: [],
          rakeAmount: 0,
          status: "ACTIVE",
          version: 0,
          createdAt: new Date().toISOString(),
          settledAt: null,
        };

        await saveTablePot(pot);

        const updated = await updateTablePot("table-up", "hand-up", (p) => ({
          ...p,
          contributions: { 0: 100, 1: 100 },
        }));

        expect(updated).not.toBeNull();
        expect(updated!.contributions[0]).toBe(100);
        expect(updated!.contributions[1]).toBe(100);
      });

      it("returns null for non-existent pot", async () => {
        const result = await updateTablePot("nonexistent", "hand", (p) => p);
        expect(result).toBeNull();
      });

      it("increments version on update", async () => {
        const pot: TablePot = {
          potId: "table-ver:hand-ver",
          tableId: "table-ver",
          handId: "hand-ver",
          contributions: {},
          pots: [],
          rakeAmount: 0,
          status: "ACTIVE",
          version: 0,
          createdAt: new Date().toISOString(),
          settledAt: null,
        };

        await saveTablePot(pot);

        await updateTablePot("table-ver", "hand-ver", (p) => ({ ...p, contributions: { 0: 50 } }));
        let result = await getTablePot("table-ver", "hand-ver");
        expect(result!.version).toBe(1);

        await updateTablePot("table-ver", "hand-ver", (p) => ({ ...p, contributions: { 0: 100 } }));
        result = await getTablePot("table-ver", "hand-ver");
        expect(result!.version).toBe(2);
      });
    });
  });
});
