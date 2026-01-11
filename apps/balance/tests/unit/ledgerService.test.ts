import { describe, expect, it, beforeEach } from "vitest";
import {
  queryLedger,
  verifyAccountLedger,
  getAccountChecksum,
} from "../../src/services/ledgerService";
import { ensureAccount, creditBalance, debitBalance } from "../../src/services/accountService";
import { resetAccounts } from "../../src/storage/accountStore";
import { resetTransactions } from "../../src/storage/transactionStore";
import { resetReservations } from "../../src/storage/reservationStore";
import { resetIdempotency } from "../../src/storage/idempotencyStore";
import { resetLedger } from "../../src/storage/ledgerStore";

describe("ledgerService", () => {
  beforeEach(async () => {
    await resetAccounts();
    await resetTransactions();
    await resetReservations();
    await resetIdempotency();
    await resetLedger();
  });

  describe("queryLedger", () => {
    it("returns empty ledger for new account", async () => {
      await ensureAccount("user-1", 0);

      const result = await queryLedger("user-1");

      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.latestChecksum).toBe("GENESIS");
    });

    it("returns entries after transactions", async () => {
      await ensureAccount("user-2", 0);
      await creditBalance("user-2", 1000, "DEPOSIT", "tx-1");
      await debitBalance("user-2", 300, "WITHDRAW", "tx-2");

      const result = await queryLedger("user-2");

      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(2);

      // Most recent first
      const [entry1, entry2] = result.entries;
      expect(entry2.type).toBe("DEPOSIT");
      expect(entry2.amount).toBe(1000);
      expect(entry1.type).toBe("WITHDRAW");
      expect(entry1.amount).toBe(-300);
    });

    it("respects limit parameter", async () => {
      await ensureAccount("user-3", 0);
      await creditBalance("user-3", 100, "DEPOSIT", "tx-3");
      await creditBalance("user-3", 200, "DEPOSIT", "tx-4");
      await creditBalance("user-3", 300, "DEPOSIT", "tx-5");
      await creditBalance("user-3", 400, "DEPOSIT", "tx-6");
      await creditBalance("user-3", 500, "DEPOSIT", "tx-7");

      const result = await queryLedger("user-3", { limit: 3 });

      expect(result.entries).toHaveLength(3);
      expect(result.total).toBe(5);
    });

    it("includes checksum chain", async () => {
      await ensureAccount("user-4", 0);
      await creditBalance("user-4", 500, "DEPOSIT", "tx-8");
      await creditBalance("user-4", 300, "DEPOSIT", "tx-9");

      const result = await queryLedger("user-4");

      expect(result.entries[0].checksum).toBeDefined();
      expect(result.entries[0].previousChecksum).toBeDefined();
      expect(result.entries[1].previousChecksum).toBe("GENESIS");
      expect(result.entries[0].previousChecksum).toBe(result.entries[1].checksum);
    });
  });

  describe("verifyAccountLedger", () => {
    it("returns valid for empty ledger", async () => {
      await ensureAccount("user-5", 0);

      const result = await verifyAccountLedger("user-5");

      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(0);
    });

    it("returns valid for ledger with correct checksums", async () => {
      await ensureAccount("user-6", 0);
      await creditBalance("user-6", 1000, "DEPOSIT", "tx-10");
      await debitBalance("user-6", 200, "WITHDRAW", "tx-11");
      await creditBalance("user-6", 500, "POT_WIN", "tx-12");

      const result = await verifyAccountLedger("user-6");

      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(3);
    });

    it("verifies checksum chain integrity", async () => {
      await ensureAccount("user-7", 0);

      // Create multiple transactions
      for (let i = 0; i < 10; i++) {
        await creditBalance("user-7", 100, "DEPOSIT", `tx-chain-${i}`);
      }

      const result = await verifyAccountLedger("user-7");

      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(10);
    });
  });

  describe("getAccountChecksum", () => {
    it("returns GENESIS for new account", async () => {
      await ensureAccount("user-8", 0);

      const checksum = await getAccountChecksum("user-8");

      expect(checksum).toBe("GENESIS");
    });

    it("returns latest checksum after transactions", async () => {
      await ensureAccount("user-9", 0);
      await creditBalance("user-9", 1000, "DEPOSIT", "tx-13");

      const checksum = await getAccountChecksum("user-9");

      expect(checksum).not.toBe("GENESIS");
      expect(checksum).toHaveLength(64); // SHA-256 hex length
    });

    it("checksum changes with each transaction", async () => {
      await ensureAccount("user-10", 0);

      const checksum1 = await getAccountChecksum("user-10");
      await creditBalance("user-10", 100, "DEPOSIT", "tx-14");
      const checksum2 = await getAccountChecksum("user-10");
      await creditBalance("user-10", 200, "DEPOSIT", "tx-15");
      const checksum3 = await getAccountChecksum("user-10");

      expect(checksum1).toBe("GENESIS");
      expect(checksum2).not.toBe(checksum1);
      expect(checksum3).not.toBe(checksum2);
    });
  });

  describe("audit trail completeness", () => {
    it("records all balance changes in ledger", async () => {
      await ensureAccount("user-11", 0);

      // Deposit
      await creditBalance("user-11", 1000, "DEPOSIT", "audit-1");
      // Buy-in
      await debitBalance("user-11", 500, "BUY_IN", "audit-2");
      // Win pot
      await creditBalance("user-11", 750, "POT_WIN", "audit-3");
      // Cash out
      await creditBalance("user-11", 500, "CASH_OUT", "audit-4");

      const result = await queryLedger("user-11");

      expect(result.entries).toHaveLength(4);

      const types = result.entries.map((e) => e.type);
      expect(types).toContain("DEPOSIT");
      expect(types).toContain("BUY_IN");
      expect(types).toContain("POT_WIN");
      expect(types).toContain("CASH_OUT");
    });

    it("records correct balance progression", async () => {
      await ensureAccount("user-12", 0);

      await creditBalance("user-12", 1000, "DEPOSIT", "prog-1");
      await debitBalance("user-12", 200, "WITHDRAW", "prog-2");
      await creditBalance("user-12", 500, "DEPOSIT", "prog-3");

      const result = await queryLedger("user-12");

      // Entries are in reverse chronological order
      const [entry3, entry2, entry1] = result.entries;

      expect(entry1.balanceBefore).toBe(0);
      expect(entry1.balanceAfter).toBe(1000);

      expect(entry2.balanceBefore).toBe(1000);
      expect(entry2.balanceAfter).toBe(800);

      expect(entry3.balanceBefore).toBe(800);
      expect(entry3.balanceAfter).toBe(1300);
    });

    it("includes metadata in ledger entries", async () => {
      await ensureAccount("user-13", 1000);
      await debitBalance("user-13", 500, "BUY_IN", "meta-1", {
        tableId: "table-123",
        seatId: 0,
      });

      const result = await queryLedger("user-13");

      expect(result.entries[0].metadata.tableId).toBe("table-123");
      expect(result.entries[0].metadata.seatId).toBe(0);
    });
  });
});
