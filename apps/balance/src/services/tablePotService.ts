import {
  ContributionResult,
  Pot,
  SettlementWinner,
  SettlePotResult,
  SettlementResultItem,
  TablePot,
} from "../domain/types";
import { nowIso } from "../utils/time";
import {
  getTablePot,
  saveTablePot,
  updateTablePot,
} from "../storage/tablePotStore";
import { creditBalance } from "./accountService";
import { recordPotContribution, recordPotSettlement } from "../observability/metrics";
import logger from "../observability/logger";
import { withIdempotentResponse } from "../utils/idempotency";

function calculateRake(totalPot: number): number {
  if (totalPot <= 20) {
    return 0;
  }
  return Math.min(Math.floor(totalPot * 0.05), 5);
}

function normalizeWinners(
  winners: SettlementWinner[],
  targetTotal: number
): SettlementWinner[] {
  const totalRequested = winners.reduce((sum, w) => sum + w.amount, 0);
  if (totalRequested <= 0 || targetTotal <= 0) {
    return winners.map((w) => ({ ...w, amount: 0 }));
  }

  const basePayouts = winners.map((winner) => ({
    ...winner,
    amount: Math.floor((winner.amount / totalRequested) * targetTotal),
  }));

  let remainder = targetTotal - basePayouts.reduce((sum, w) => sum + w.amount, 0);
  if (remainder > 0) {
    const sorted = [...basePayouts].sort((a, b) => a.seatId - b.seatId);
    let idx = 0;
    while (remainder > 0) {
      sorted[idx].amount += 1;
      remainder -= 1;
      idx = (idx + 1) % sorted.length;
    }
    return sorted;
  }

  return basePayouts;
}

export async function createPot(tableId: string, handId: string): Promise<TablePot> {
  const pot: TablePot = {
    potId: `${tableId}:${handId}`,
    tableId,
    handId,
    contributions: {},
    pots: [],
    rakeAmount: 0,
    status: "ACTIVE",
    version: 0,
    createdAt: nowIso(),
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
  return withIdempotentResponse(idempotencyKey, async () => {
    if (amount <= 0) {
      return { ok: false, error: "INVALID_AMOUNT" };
    }

    const pot = await ensurePot(tableId, handId);
    if (pot.status !== "ACTIVE") {
      return { ok: false, error: "POT_NOT_ACTIVE" };
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
      return { ok: false, error: "UPDATE_FAILED" };
    }

    const totalPot = Object.values(updated.contributions).reduce((sum, c) => sum + c, 0);
    const seatContribution = updated.contributions[seatId] ?? 0;
    recordPotContribution(amount);

    return {
      ok: true,
      totalPot,
      seatContribution,
    };
  });
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
  return withIdempotentResponse(idempotencyKey, async () => {
    const pot = await getTablePot(tableId, handId);
    if (!pot) {
      return { ok: false, error: "POT_NOT_FOUND" };
    }

    if (pot.status === "SETTLED") {
      // Already settled - return success (idempotent)
      return { ok: true, results: [] };
    }

    if (pot.status !== "ACTIVE") {
      return { ok: false, error: "POT_NOT_ACTIVE" };
    }

    const totalPot = Object.values(pot.contributions).reduce((sum, amount) => sum + amount, 0);
    const rakeAmount = calculateRake(totalPot);
    const netPot = Math.max(totalPot - rakeAmount, 0);
    const normalizedWinners = normalizeWinners(winners, netPot);

    // Process each winner
    const settlementResults: SettlementResultItem[] = [];

    for (const winner of normalizedWinners) {
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

      if (!creditResult.ok) {
        return { ok: false, error: creditResult.error };
      }

      settlementResults.push({
        accountId: winner.accountId,
        transactionId: creditResult.transaction.transactionId,
        amount: winner.amount,
        newBalance: creditResult.transaction.balanceAfter,
      });
    }

    // Mark pot as settled
    await updateTablePot(tableId, handId, (current) => ({
      ...current,
      status: "SETTLED",
      rakeAmount,
      settledAt: nowIso(),
    }));
    recordPotSettlement(totalPot, rakeAmount);

    return { ok: true, results: settlementResults };
  });
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
    settledAt: nowIso(),
  }));

  logger.info({ tableId, handId, reason }, "pot.cancelled");
  return { ok: true };
}

export async function getPotState(
  tableId: string,
  handId: string
): Promise<TablePot | null> {
  return getTablePot(tableId, handId);
}
