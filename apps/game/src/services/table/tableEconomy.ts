import { calculatePotPayouts } from '../../engine/potSettlement';
import type { BalanceClient } from '../../clients/balanceClient';
import type { Action, Pot, Seat } from '../../domain/types';

export type TableEconomyResult =
  | { readonly type: 'ok' }
  | { readonly type: 'unavailable'; readonly error: unknown }
  | { readonly type: 'error'; readonly error: string };

export type TableEconomy = {
  recordHandStartContributions(params: {
    tableId: string;
    handId: string;
    actions: readonly Action[];
  }): Promise<TableEconomyResult>;

  recordActionContribution(params: {
    tableId: string;
    handId: string;
    action: Action;
    amount: number;
  }): Promise<TableEconomyResult>;

  settleHand(params: {
    tableId: string;
    handId: string;
    buttonSeat: number;
    seats: readonly Seat[];
    pots: readonly Pot[];
  }): Promise<TableEconomyResult>;
};

function makeContributionIdempotencyKey(tableId: string, handId: string, actionId: string) {
  return `contrib:${tableId}:${handId}:${actionId}`;
}

function makeSettlementIdempotencyKey(tableId: string, handId: string) {
  return `settle:${tableId}:${handId}`;
}

function asContributionType(actionType: Action['type']) {
  return actionType === 'POST_BLIND' ? 'BLIND' : actionType;
}

type CreateBalanceTableEconomyOptions = {
  balanceClient: Pick<BalanceClient, 'recordContribution' | 'settlePot'>;
};

export function createBalanceTableEconomy(options: CreateBalanceTableEconomyOptions): TableEconomy {
  const balanceClient = options.balanceClient;

  return {
    async recordHandStartContributions({ tableId, handId, actions }) {
      const contributions = actions.filter(
        (action) => action.type === 'POST_BLIND' && action.amount > 0 && action.userId.length > 0,
      );

      const calls = contributions.map((action) =>
        balanceClient.recordContribution({
          tableId,
          handId,
          seatId: action.seatId,
          accountId: action.userId,
          amount: action.amount,
          contributionType: asContributionType(action.type),
          idempotencyKey: makeContributionIdempotencyKey(tableId, handId, action.actionId),
        }),
      );

      const results = await Promise.all(calls);
      const unavailable = results.find((result) => !result.ok);
      if (unavailable && !unavailable.ok) {
        return { type: 'unavailable', error: unavailable.error };
      }

      const failed = results.find((result) => result.ok && !result.value.ok);
      if (failed && failed.ok) {
        return {
          type: 'error',
          error: failed.value.error || 'CONTRIBUTION_FAILED',
        };
      }

      return { type: 'ok' };
    },

    async recordActionContribution({ tableId, handId, action, amount }) {
      if (amount <= 0 || action.userId.length === 0) {
        return { type: 'ok' };
      }

      const call = await balanceClient.recordContribution({
        tableId,
        handId,
        seatId: action.seatId,
        accountId: action.userId,
        amount,
        contributionType: asContributionType(action.type),
        idempotencyKey: makeContributionIdempotencyKey(tableId, handId, action.actionId),
      });

      if (!call.ok) {
        return { type: 'unavailable', error: call.error };
      }

      if (!call.value.ok) {
        return { type: 'error', error: call.value.error || 'CONTRIBUTION_FAILED' };
      }

      return { type: 'ok' };
    },

    async settleHand({ tableId, handId, buttonSeat, seats, pots }) {
      const payoutBySeatId = new Map<number, number>();

      for (const pot of pots) {
        if (pot.amount <= 0 || !pot.winners || pot.winners.length === 0) {
          continue;
        }

        const payouts = calculatePotPayouts({
          amount: pot.amount,
          winnerSeatIds: pot.winners,
          buttonSeat,
          seatCount: seats.length,
        });

        for (const payout of payouts) {
          payoutBySeatId.set(
            payout.seatId,
            (payoutBySeatId.get(payout.seatId) ?? 0) + payout.amount,
          );
        }
      }

      const winners = Array.from(payoutBySeatId.entries())
        .filter(([, amount]) => amount > 0)
        .map(([seatId, amount]) => ({
          seatId,
          accountId: seats[seatId]?.userId ?? '',
          amount,
        }))
        .filter((winner) => winner.accountId.length > 0);

      const settleCall = await balanceClient.settlePot({
        tableId,
        handId,
        winners,
        idempotencyKey: makeSettlementIdempotencyKey(tableId, handId),
      });

      if (!settleCall.ok) {
        return { type: 'unavailable', error: settleCall.error };
      }

      if (!settleCall.value.ok) {
        return { type: 'error', error: settleCall.value.error || 'UNKNOWN' };
      }

      return { type: 'ok' };
    },
  };
}
