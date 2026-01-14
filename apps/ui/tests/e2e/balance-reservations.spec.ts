import { expect, test } from "@playwright/test";
import crypto from "crypto";
import { createBalanceClient, grpcCall } from "./helpers/grpc";
import { ensureBalance } from "./helpers/balance";
import { urls } from "./helpers/urls";
import { generateToken } from "./helpers/auth";
import { authHeaders } from "./helpers/http";

test.describe("Balance Reservations (gRPC)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "API-only checks run once.");
  test.setTimeout(45_000);

  test("expires reservations after timeout and supports idempotent reserve", async ({ request }) => {
    const accountId = `acct-resv-${crypto.randomUUID().slice(0, 10)}`;
    await ensureBalance(accountId, 500);

    const client = createBalanceClient("localhost:50051");

    const reserveDefault = await grpcCall(client.ReserveForBuyIn.bind(client), {
      account_id: accountId,
      table_id: "test-table",
      amount: 50,
      idempotency_key: `reserve-default:${accountId}:${Date.now()}`,
    });
    expect(reserveDefault.ok).toBe(true);
    expect(reserveDefault.reservation_id).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const commitDefault = await grpcCall(client.CommitReservation.bind(client), {
      reservation_id: reserveDefault.reservation_id,
    });
    expect(commitDefault.ok).toBe(true);

    const reserveShort = await grpcCall(client.ReserveForBuyIn.bind(client), {
      account_id: accountId,
      table_id: "test-table",
      amount: 25,
      idempotency_key: `reserve-short:${accountId}:${Date.now()}`,
      timeout_seconds: 1,
    });
    expect(reserveShort.ok).toBe(true);
    expect(reserveShort.reservation_id).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const commitExpired = await grpcCall(client.CommitReservation.bind(client), {
      reservation_id: reserveShort.reservation_id,
    });
    expect(commitExpired.ok).toBe(false);
    expect(commitExpired.error).toBe("RESERVATION_EXPIRED");

    const idempotencyKey = `reserve-idem:${accountId}:${Date.now()}`;
    const first = await grpcCall(client.ReserveForBuyIn.bind(client), {
      account_id: accountId,
      table_id: "test-table",
      amount: 10,
      idempotency_key: idempotencyKey,
      timeout_seconds: 10,
    });
    const second = await grpcCall(client.ReserveForBuyIn.bind(client), {
      account_id: accountId,
      table_id: "test-table",
      amount: 10,
      idempotency_key: idempotencyKey,
      timeout_seconds: 10,
    });
    expect(second.ok).toBe(true);
    expect(second.reservation_id).toBe(first.reservation_id);

    const commitIdempotent = await grpcCall(client.CommitReservation.bind(client), {
      reservation_id: first.reservation_id,
    });
    expect(commitIdempotent.ok).toBe(true);

    const token = generateToken(accountId, "ReservationUser");
    const balance = await request.get(`${urls.gateway}/api/accounts/${accountId}/balance`, {
      headers: authHeaders(token),
    });
    expect(balance.ok()).toBeTruthy();
  });

  test("rejects reserve when funds are insufficient", async ({ request }) => {
    const accountId = `acct-low-${crypto.randomUUID().slice(0, 10)}`;
    const token = generateToken(accountId, "LowFunds");

    const ensure = await request.post(`${urls.gateway}/api/accounts/${accountId}`, {
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      data: { initialBalance: 0 },
    });
    expect([200, 201]).toContain(ensure.status());

    const client = createBalanceClient("localhost:50051");
    const reserve = await grpcCall(client.ReserveForBuyIn.bind(client), {
      account_id: accountId,
      table_id: "test-table",
      amount: 10,
      idempotency_key: `reserve-insufficient:${accountId}:${Date.now()}`,
      timeout_seconds: 5,
    });

    expect(reserve.ok).toBe(false);
    expect(reserve.error).toBe("INSUFFICIENT_BALANCE");
  });
});
