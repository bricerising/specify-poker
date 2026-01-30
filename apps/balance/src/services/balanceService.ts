import * as accountService from './accountService';
import * as reservationService from './reservationService';
import * as ledgerService from './ledgerService';
import * as tablePotService from './tablePotService';
import * as transactionStore from '../storage/transactionStore';
import type {
  Account,
  BalanceInfo,
  CashOutResult,
  CommitResult,
  ContributionResult,
  ReleaseResult,
  ReservationResult,
  SettlePotResult,
  SettlementWinner,
  Transaction,
} from '../domain/types';
import type { AccountErrorCode } from '../domain/errors';
import type { Result } from '../domain/result';
import type { LedgerQueryOptions, LedgerQueryResult } from './ledgerService';

type TransactionResult = Result<Transaction, AccountErrorCode>;

export type BalanceServiceDependencies = {
  getBalance(accountId: string): Promise<BalanceInfo | null>;
  ensureAccount(
    accountId: string,
    initialBalance?: number,
  ): Promise<{ account: Account; created: boolean }>;
  processDeposit(
    accountId: string,
    amount: number,
    source: string,
    idempotencyKey: string,
  ): Promise<TransactionResult>;
  processWithdrawal(
    accountId: string,
    amount: number,
    idempotencyKey: string,
    reason?: string,
  ): Promise<TransactionResult>;
  processCashOut(
    accountId: string,
    tableId: string,
    seatId: number,
    amount: number,
    idempotencyKey: string,
    handId?: string,
  ): Promise<CashOutResult>;

  reserveForBuyIn(
    accountId: string,
    tableId: string,
    amount: number,
    idempotencyKey: string,
    timeoutSeconds?: number,
  ): Promise<ReservationResult>;
  commitReservation(reservationId: string): Promise<CommitResult>;
  releaseReservation(reservationId: string, reason?: string): Promise<ReleaseResult>;

  recordContribution(
    tableId: string,
    handId: string,
    seatId: number,
    accountId: string,
    amount: number,
    contributionType: string,
    idempotencyKey: string,
  ): Promise<ContributionResult>;
  settlePot(
    tableId: string,
    handId: string,
    winners: SettlementWinner[],
    idempotencyKey: string,
  ): Promise<SettlePotResult>;
  cancelPot(
    tableId: string,
    handId: string,
    reason: string,
  ): Promise<{ ok: boolean; error?: string }>;

  queryLedger(accountId: string, options?: LedgerQueryOptions): Promise<LedgerQueryResult>;
  getTransactionsByAccount(
    accountId: string,
    options?: { limit?: number; offset?: number; type?: string },
  ): Promise<{ transactions: Transaction[]; total: number }>;
};

export type BalanceService = Readonly<BalanceServiceDependencies>;

export function createBalanceService(deps: BalanceServiceDependencies): BalanceService {
  return deps;
}

export const balanceService: BalanceService = createBalanceService({
  getBalance: accountService.getBalance,
  ensureAccount: accountService.ensureAccount,
  processDeposit: accountService.processDeposit,
  processWithdrawal: accountService.processWithdrawal,
  processCashOut: accountService.processCashOut,
  reserveForBuyIn: reservationService.reserveForBuyIn,
  commitReservation: reservationService.commitReservation,
  releaseReservation: reservationService.releaseReservation,
  recordContribution: tablePotService.recordContribution,
  settlePot: tablePotService.settlePot,
  cancelPot: tablePotService.cancelPot,
  queryLedger: ledgerService.queryLedger,
  getTransactionsByAccount: transactionStore.getTransactionsByAccount,
});
