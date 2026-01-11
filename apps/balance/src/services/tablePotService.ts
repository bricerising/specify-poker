import { randomUUID } from "crypto";
import {
  ContributionResult,
  Pot,
  SettlementWinner,
  SettlePotResult,
  SettlementResultItem,
  TablePot,
} from "../domain/types";
import {
  getTablePot,
  saveTablePot,
  updateTablePot,
} from "../storage/tablePotStore";
import { creditBalance } from "./accountService";
import { getIdempotentResponse, setIdempotentResponse } from "../storage/idempotencyStore";

function now(): string {
  return new Date().toISOString();
}

export async function createPot(tableId: string, handId: string): Promise<TablePot> {
  const pot: TablePot = {
    potId: `${tableId}:${handId}`,
    tableId,
    handId,
    contributions: {},
    pots: [],
    status: "ACTIVE",
    version: 0,
    createdAt: now(),
    settledAt: null,
  };

  await saveTablePot(pot);
  return pot;
}

export async function ensurePot(tableId: string, handId: string): Promise<TablePot> {
  const existing = await getTablePot(tableId, handId);
  if (existing) {
    return existing;
  }
  return createPot(tableId, handId);
}

export async function recordContribution(
  tableId: string,
  handId: string,
  seatId: number,
  accountId: string,
  amount: number,
  contributionType: string,
  idempotencyKey: string
): Promise<ContributionResult> {
  // Check idempotency
  const existingResponse = await getIdempotentResponse(idempotencyKey);
  if (existingResponse) {
    return existingResponse as ContributionResult;
  }

  const pot = await ensurePot(tableId, handId);
  if (pot.status !== "ACTIVE") {
    const result: ContributionResult = { ok: false, error: "POT_NOT_ACTIVE" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  // Update contributions
  const updated = await updateTablePot(tableId, handId, (current) => {
    const newContributions = { ...current.contributions };
    newContributions[seatId] = (newContributions[seatId] ?? 0) + amount;
    return {
      ...current,
      contributions: newContributions,
    };
  });

  if (!updated) {
    const result: ContributionResult = { ok: false, error: "UPDATE_FAILED" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  const totalPot = Object.values(updated.contributions).reduce((sum, c) => sum + c, 0);
  const seatContribution = updated.contributions[seatId] ?? 0;

  const result: ContributionResult = {
    ok: true,
    totalPot,
    seatContribution,
  };
  await setIdempotentResponse(idempotencyKey, result);
  return result;
}

// Calculate pots including side pots for all-in scenarios
export function calculatePots(
  contributions: Record<number, number>,
  foldedSeatIds: Set<number>
): Pot[] {
  const entries = Object.entries(contributions)
    .map(([seatId, amount]) => ({
      seatId: parseInt(seatId, 10),
      amount,
      folded: foldedSeatIds.has(parseInt(seatId, 10)),
    }))
    .filter((e) => e.amount > 0);

  if (entries.length === 0) {
    return [];
  }

  // Sort by contribution amount
  entries.sort((a, b) => a.amount - b.amount);

  const pots: Pot[] = [];
  let previousLevel = 0;

  for (let i = 0; i < entries.length; i++) {
    const currentLevel = entries[i].amount;
    if (currentLevel > previousLevel) {
      const increment = currentLevel - previousLevel;
      const eligibleSeats = entries
        .slice(i)
        .filter((e) => !e.folded)
        .map((e) => e.seatId);

      const potAmount = increment * (entries.length - i);

      if (potAmount > 0 && eligibleSeats.length > 0) {
        pots.push({
          amount: potAmount,
          eligibleSeatIds: eligibleSeats,
        });
      }
    }
    previousLevel = currentLevel;
  }

  return pots;
}

export async function settlePot(
  tableId: string,
  handId: string,
  winners: SettlementWinner[],
  idempotencyKey: string
): Promise<SettlePotResult> {
  // Check idempotency
  const existingResponse = await getIdempotentResponse(idempotencyKey);
  if (existingResponse) {
    return existingResponse as SettlePotResult;
  }

  const pot = await getTablePot(tableId, handId);
  if (!pot) {
    const result: SettlePotResult = { ok: false, error: "POT_NOT_FOUND" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  if (pot.status === "SETTLED") {
    // Already settled - return success (idempotent)
    const result: SettlePotResult = { ok: true, results: [] };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  if (pot.status !== "ACTIVE") {
    const result: SettlePotResult = { ok: false, error: "POT_NOT_ACTIVE" };
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  }

  // Process each winner
  const settlementResults: SettlementResultItem[] = [];

  for (const winner of winners) {
    if (winner.amount <= 0) {
      continue;
    }

    const creditResult = await creditBalance(
      winner.accountId,
      winner.amount,
      "POT_WIN",
      `${idempotencyKey}:${winner.seatId}`,
      {
        tableId,
        handId,
        seatId: winner.seatId,
      }
    );

    if (creditResult.ok && creditResult.transaction) {
      settlementResults.push({
        accountId: winner.accountId,
        transactionId: creditResult.transaction.transactionId,
        amount: winner.amount,
        newBalance: creditResult.transaction.balanceAfter,
      });
    }
  }

  // Mark pot as settled
  await updateTablePot(tableId, handId, (current) => ({
    ...current,
    status: "SETTLED",
    settledAt: now(),
  }));

  const result: SettlePotResult = { ok: true, results: settlementResults };
  await setIdempotentResponse(idempotencyKey, result);
  return result;
}

export async function cancelPot(
  tableId: string,
  handId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const pot = await getTablePot(tableId, handId);
  if (!pot) {
    return { ok: false, error: "POT_NOT_FOUND" };
  }

  if (pot.status !== "ACTIVE") {
    return { ok: false, error: "POT_NOT_ACTIVE" };
  }

  await updateTablePot(tableId, handId, (current) => ({
    ...current,
    status: "CANCELLED",
    settledAt: now(),
  }));

  console.log("pot.cancelled", { tableId, handId, reason });
  return { ok: true };
}

export async function getPotState(
  tableId: string,
  handId: string
): Promise<TablePot | null> {
  return getTablePot(tableId, handId);
}
