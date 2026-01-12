import { describe, expect, it, beforeEach } from "vitest";
import {
  getBalance,
  ensureAccount,
  creditBalance,
  debitBalance,
  processDeposit,
  processWithdrawal,
  processCashOut,
} from "../../src/services/accountService";
import { resetAccounts } from "../../src/storage/accountStore";
import { resetTransactions } from "../../src/storage/transactionStore";
import { resetReservations } from "../../src/storage/reservationStore";
import { resetIdempotency } from "../../src/storage/idempotencyStore";
import { resetLedger } from "../../src/storage/ledgerStore";

describe("accountService", () => {
  beforeEach(async () => {
    await resetAccounts();
    await resetTransactions();
    await resetReservations();
    await resetIdempotency();
    await resetLedger();
  });

  describe("ensureAccount", () => {
    it("creates a new account with zero balance", async () => {
      const result = await ensureAccount("user-1");

      expect(result.created).toBe(true);
      expect(result.account.accountId).toBe("user-1");
      expect(result.account.balance).toBe(0);
      expect(result.account.currency).toBe("CHIPS");
      expect(result.account.version).toBe(0);
    });

    it("creates account with initial balance", async () => {
      const result = await ensureAccount("user-2", 1000);

      expect(result.created).toBe(true);
      expect(result.account.balance).toBe(1000);
    });

    it("returns existing account without modification", async () => {
      await ensureAccount("user-3", 500);
      const result = await ensureAccount("user-3", 1000);

      expect(result.created).toBe(false);
      expect(result.account.balance).toBe(500);
    });
  });

  describe("getBalance", () => {
    it("returns null for non-existent account", async () => {
      const result = await getBalance("nonexistent");
      expect(result).toBeNull();
    });

    it("returns balance info for existing account", async () => {
      await ensureAccount("user-4", 750);
      const result = await getBalance("user-4");

      expect(result).not.toBeNull();
      expect(result!.accountId).toBe("user-4");
      expect(result!.balance).toBe(750);
      expect(result!.availableBalance).toBe(750);
      expect(result!.currency).toBe("CHIPS");
    });
  });

  describe("creditBalance", () => {
    it("adds chips to account", async () => {
      await ensureAccount("user-5", 100);
      const result = await creditBalance("user-5", 500, "DEPOSIT", "credit-1");

      expect(result.ok).toBe(true);
      expect(result.transaction).toBeDefined();
      expect(result.transaction!.amount).toBe(500);
      expect(result.transaction!.balanceBefore).toBe(100);
      expect(result.transaction!.balanceAfter).toBe(600);
      expect(result.transaction!.type).toBe("DEPOSIT");
      expect(result.transaction!.status).toBe("COMPLETED");

      const balance = await getBalance("user-5");
      expect(balance!.balance).toBe(600);
    });

    it("rejects zero amount", async () => {
      await ensureAccount("user-6", 100);
      const result = await creditBalance("user-6", 0, "DEPOSIT", "credit-2");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("INVALID_AMOUNT");
    });

    it("rejects negative amount", async () => {
      await ensureAccount("user-7", 100);
      const result = await creditBalance("user-7", -50, "DEPOSIT", "credit-3");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("INVALID_AMOUNT");
    });

    it("fails for non-existent account", async () => {
      const result = await creditBalance("nonexistent", 100, "DEPOSIT", "credit-4");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("ACCOUNT_NOT_FOUND");
    });

    it("is idempotent with same key", async () => {
      await ensureAccount("user-8", 100);
      const key = "idempotent-credit";

      const result1 = await creditBalance("user-8", 500, "DEPOSIT", key);
      const result2 = await creditBalance("user-8", 500, "DEPOSIT", key);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.transaction!.transactionId).toBe(result2.transaction!.transactionId);

      const balance = await getBalance("user-8");
      expect(balance!.balance).toBe(600); // Only credited once
    });
  });

  describe("debitBalance", () => {
    it("removes chips from account", async () => {
      await ensureAccount("user-9", 1000);
      const result = await debitBalance("user-9", 300, "WITHDRAW", "debit-1");

      expect(result.ok).toBe(true);
      expect(result.transaction!.amount).toBe(300);
      expect(result.transaction!.balanceBefore).toBe(1000);
      expect(result.transaction!.balanceAfter).toBe(700);

      const balance = await getBalance("user-9");
      expect(balance!.balance).toBe(700);
    });

    it("rejects insufficient balance", async () => {
      await ensureAccount("user-10", 100);
      const result = await debitBalance("user-10", 500, "WITHDRAW", "debit-2");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("INSUFFICIENT_BALANCE");

      const balance = await getBalance("user-10");
      expect(balance!.balance).toBe(100); // Unchanged
    });

    it("allows debit of exact balance", async () => {
      await ensureAccount("user-11", 500);
      const result = await debitBalance("user-11", 500, "WITHDRAW", "debit-3");

      expect(result.ok).toBe(true);
      expect(result.transaction!.balanceAfter).toBe(0);
    });

    it("rejects zero amount", async () => {
      await ensureAccount("user-12", 100);
      const result = await debitBalance("user-12", 0, "WITHDRAW", "debit-4");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("INVALID_AMOUNT");
    });

    it("is idempotent with same key", async () => {
      await ensureAccount("user-13", 1000);
      const key = "idempotent-debit";

      const result1 = await debitBalance("user-13", 300, "WITHDRAW", key);
      const result2 = await debitBalance("user-13", 300, "WITHDRAW", key);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.transaction!.transactionId).toBe(result2.transaction!.transactionId);

      const balance = await getBalance("user-13");
      expect(balance!.balance).toBe(700); // Only debited once
    });
  });

  describe("processDeposit", () => {
    it("creates account if not exists and deposits", async () => {
      const result = await processDeposit("new-user", 1000, "FREEROLL", "deposit-1");

      expect(result.ok).toBe(true);
      expect(result.transaction!.type).toBe("DEPOSIT");
      expect(result.transaction!.balanceAfter).toBe(1000);
    });

    it("deposits to existing account", async () => {
      await ensureAccount("existing-user", 500);
      const result = await processDeposit("existing-user", 500, "BONUS", "deposit-2");

      expect(result.ok).toBe(true);
      expect(result.transaction!.balanceAfter).toBe(1000);
    });
  });

  describe("processWithdrawal", () => {
    it("withdraws from account", async () => {
      await ensureAccount("user-14", 1000);
      const result = await processWithdrawal("user-14", 400, "withdraw-1", "Player request");

      expect(result.ok).toBe(true);
      expect(result.transaction!.type).toBe("WITHDRAW");
      expect(result.transaction!.balanceAfter).toBe(600);
    });

    it("rejects withdrawal exceeding balance", async () => {
      await ensureAccount("user-15", 100);
      const result = await processWithdrawal("user-15", 500, "withdraw-2");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("INSUFFICIENT_BALANCE");
    });
  });

  describe("processCashOut", () => {
    it("credits winnings with metadata", async () => {
      await ensureAccount("user-16", 0);
      const result = await processCashOut(
        "user-16",
        "table-1",
        0,
        750,
        "cashout-1",
        "hand-1"
      );

      expect(result.ok).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.newBalance).toBe(750);
    });
  });

  describe("concurrent operations", () => {
    it("handles sequential deposits to same account", async () => {
      await ensureAccount("user-17", 0);

      // Run sequentially - concurrent operations require Redis for atomicity
      const result1 = await creditBalance("user-17", 100, "DEPOSIT", "seq-1");
      const result2 = await creditBalance("user-17", 200, "DEPOSIT", "seq-2");
      const result3 = await creditBalance("user-17", 300, "DEPOSIT", "seq-3");

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result3.ok).toBe(true);

      const balance = await getBalance("user-17");
      expect(balance!.balance).toBe(600);
    });
  });
});
