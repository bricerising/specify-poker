import { expect, test } from "@playwright/test";
import crypto from "crypto";
import { createHash } from "crypto";
import { generateToken } from "./helpers/auth";
import { urls } from "./helpers/urls";
import { authHeaders } from "./helpers/http";

type BalanceSummary = {
  accountId?: string;
  account_id?: string;
  balance?: number;
  availableBalance?: number;
  available_balance?: number;
  currency?: string;
  version?: number;
};

type LedgerEntry = {
  entryId: string;
  transactionId: string;
  accountId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  metadata: Record<string, unknown>;
  timestamp: string;
  previousChecksum: string;
  checksum: string;
};

function computeChecksum(entry: Omit<LedgerEntry, "checksum">, previousChecksum: string): string {
  const data = JSON.stringify({
    entryId: entry.entryId,
    transactionId: entry.transactionId,
    accountId: entry.accountId,
    type: entry.type,
    amount: entry.amount,
    balanceBefore: entry.balanceBefore,
    balanceAfter: entry.balanceAfter,
    metadata: entry.metadata,
    timestamp: entry.timestamp,
    previousChecksum,
  });
  return createHash("sha256").update(data).digest("hex");
}

test.describe("Balance Ledger & Idempotency (via Gateway proxy)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "API-only checks run once.");
  test.setTimeout(30_000);

  test("enforces Idempotency-Key and maintains checksum chain", async ({ request }) => {
    const accountId = `acct-${crypto.randomUUID().slice(0, 10)}`;
    const token = generateToken(accountId, "LedgerUser");

    const ensure = await request.post(`${urls.gateway}/api/accounts/${accountId}`, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      data: { initialBalance: 0 },
    });
    expect([200, 201]).toContain(ensure.status());

    const missingKey = await request.post(`${urls.gateway}/api/accounts/${accountId}/deposit`, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      data: { amount: 100, source: "FREEROLL" },
    });
    expect(missingKey.status()).toBe(400);

    const depositKey = `deposit:${accountId}:${Date.now()}`;
    const deposit1 = await request.post(`${urls.gateway}/api/accounts/${accountId}/deposit`, {
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        "Idempotency-Key": depositKey,
      },
      data: { amount: 250, source: "FREEROLL" },
    });
    expect(deposit1.ok()).toBeTruthy();
    const depositPayload1 = (await deposit1.json()) as { transactionId?: string; balanceAfter?: number };
    expect(typeof depositPayload1.transactionId).toBe("string");

    const deposit2 = await request.post(`${urls.gateway}/api/accounts/${accountId}/deposit`, {
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        "Idempotency-Key": depositKey,
      },
      data: { amount: 250, source: "FREEROLL" },
    });
    expect(deposit2.ok()).toBeTruthy();
    const depositPayload2 = (await deposit2.json()) as { transactionId?: string; balanceAfter?: number };
    expect(depositPayload2.transactionId).toBe(depositPayload1.transactionId);
    expect(depositPayload2.balanceAfter).toBe(depositPayload1.balanceAfter);

    const withdrawKey = `withdraw:${accountId}:${Date.now()}`;
    const withdraw = await request.post(`${urls.gateway}/api/accounts/${accountId}/withdraw`, {
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        "Idempotency-Key": withdrawKey,
      },
      data: { amount: 100, reason: "E2E" },
    });
    expect(withdraw.ok()).toBeTruthy();

    const overdrawKey = `withdraw:${accountId}:${Date.now()}:over`;
    const overdraw = await request.post(`${urls.gateway}/api/accounts/${accountId}/withdraw`, {
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
        "Idempotency-Key": overdrawKey,
      },
      data: { amount: 999999, reason: "E2E_OVERDRAW" },
    });
    expect(overdraw.status()).toBe(400);
    const overdrawPayload = (await overdraw.json()) as { error?: string };
    expect(overdrawPayload.error).toBe("INSUFFICIENT_BALANCE");

    const balance = await request.get(`${urls.gateway}/api/accounts/${accountId}/balance`, {
      headers: authHeaders(token),
    });
    expect(balance.ok()).toBeTruthy();
    const balancePayload = (await balance.json()) as BalanceSummary;
    const totalBalance = balancePayload.balance ?? 0;
    expect(totalBalance).toBeGreaterThanOrEqual(0);

    const ledger = await request.get(`${urls.gateway}/api/accounts/${accountId}/ledger?limit=50`, {
      headers: authHeaders(token),
    });
    expect(ledger.ok()).toBeTruthy();
    const ledgerPayload = (await ledger.json()) as { entries: LedgerEntry[]; latestChecksum: string };
    expect(ledgerPayload.entries.length).toBeGreaterThanOrEqual(2);

    const ordered = [...ledgerPayload.entries].reverse();
    let previousChecksum = "GENESIS";
    for (const entry of ordered) {
      expect(entry.previousChecksum).toBe(previousChecksum);
      const { checksum: _checksum, ...withoutChecksum } = entry;
      const expectedChecksum = computeChecksum(withoutChecksum, previousChecksum);
      expect(entry.checksum).toBe(expectedChecksum);
      previousChecksum = entry.checksum;
    }
    expect(ledgerPayload.latestChecksum).toBe(previousChecksum);
  });
});
