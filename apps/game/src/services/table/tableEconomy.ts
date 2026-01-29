import { calculatePotPayouts } from '../../engine/potSettlement';
import type { Action, Pot, Seat } from '../../domain/types';
import type { BalanceClientAdapter } from './balanceClientAdapter';

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
  balanceClient: BalanceClientAdapter;
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
          table_id: tableId,
          hand_id: handId,
          seat_id: action.seatId,
          account_id: action.userId,
          amount: action.amount,
          contribution_type: asContributionType(action.type),
          idempotency_key: makeContributionIdempotencyKey(tableId, handId, action.actionId),
        }),
      );

      const results = await Promise.all(calls);
      const unavailable = results.find((result) => result.type === 'unavailable');
      if (unavailable?.type === 'unavailable') {
        return unavailable;
      }

      const failed = results.find((result) => result.type === 'available' && !result.response.ok);
      if (failed?.type === 'available') {
        return {
          type: 'error',
          error: failed.response.error || 'CONTRIBUTION_FAILED',
        };
      }

      return { type: 'ok' };
    },

    async recordActionContribution({ tableId, handId, action, amount }) {
      if (amount <= 0 || action.userId.length === 0) {
        return { type: 'ok' };
      }

      const call = await balanceClient.recordContribution({
        table_id: tableId,
        hand_id: handId,
        seat_id: action.seatId,
        account_id: action.userId,
        amount,
        contribution_type: asContributionType(action.type),
        idempotency_key: makeContributionIdempotencyKey(tableId, handId, action.actionId),
      });

      if (call.type === 'unavailable') {
        return call;
      }

      if (!call.response.ok) {
        return { type: 'error', error: call.response.error || 'CONTRIBUTION_FAILED' };
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
          seat_id: seatId,
          account_id: seats[seatId]?.userId ?? '',
          amount,
        }))
        .filter((winner) => winner.account_id.length > 0);

      const settleCall = await balanceClient.settlePot({
        table_id: tableId,
        hand_id: handId,
        winners,
        idempotency_key: makeSettlementIdempotencyKey(tableId, handId),
      });

      if (settleCall.type === 'unavailable') {
        return settleCall;
      }

      if (!settleCall.response.ok) {
        return { type: 'error', error: settleCall.response.error || 'UNKNOWN' };
      }

      return { type: 'ok' };
    },
  };
}
