import crypto from "crypto";
import { generateToken } from "./auth";
import { urls } from "./urls";

export async function ensureBalance(accountId: string, amount = 2000) {
  const token = generateToken(accountId, `Balance${accountId.slice(0, 4)}`);
  await fetch(`${urls.gateway}/api/accounts/${accountId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ initialBalance: 0 }),
  });

  const idempotencyKey = crypto.randomUUID();
  const res = await fetch(`${urls.gateway}/api/accounts/${accountId}/deposit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount, source: "FREEROLL" }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to deposit balance: ${res.status} ${text}`);
  }
}
