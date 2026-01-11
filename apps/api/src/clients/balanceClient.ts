import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";

const PROTO_PATH = path.resolve(
  __dirname,
  "../../../../specs/002-balance-service/balance.proto"
);

// Types for balance service responses
export interface GetBalanceResponse {
  account_id: string;
  balance: number;
  available_balance: number;
  currency: string;
  version: number;
}

export interface EnsureAccountResponse {
  account_id: string;
  balance: number;
  created: boolean;
}

export interface ReserveForBuyInResponse {
  ok: boolean;
  reservation_id: string;
  error: string;
  available_balance: number;
}

export interface CommitReservationResponse {
  ok: boolean;
  transaction_id: string;
  error: string;
  new_balance: number;
}

export interface ReleaseReservationResponse {
  ok: boolean;
  error: string;
  available_balance: number;
}

export interface ProcessCashOutResponse {
  ok: boolean;
  transaction_id: string;
  error: string;
  new_balance: number;
}

export interface RecordContributionResponse {
  ok: boolean;
  error: string;
  total_pot: number;
  seat_contribution: number;
}

export interface SettlePotResponse {
  ok: boolean;
  error: string;
  results: Array<{
    account_id: string;
    transaction_id: string;
    amount: number;
    new_balance: number;
  }>;
}

export interface CancelPotResponse {
  ok: boolean;
  error: string;
}

// Client configuration
let client: any = null;
let enabled = false;

function getBalanceServiceUrl(): string | null {
  const url = process.env.BALANCE_SERVICE_URL?.trim();
  return url && url.length > 0 ? url : null;
}

export function isBalanceServiceEnabled(): boolean {
  return Boolean(getBalanceServiceUrl()) && enabled;
}

export function setBalanceServiceEnabled(value: boolean): void {
  enabled = value;
}

export async function initBalanceClient(): Promise<void> {
  const url = getBalanceServiceUrl();
  if (!url) {
    console.log("Balance service URL not configured, running in legacy mode");
    return;
  }

  try {
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDefinition) as any;
    client = new proto.balance.BalanceService(
      url,
      grpc.credentials.createInsecure()
    );

    enabled = true;
    console.log(`Balance client initialized, connected to ${url}`);
  } catch (error) {
    console.warn("Failed to initialize balance client:", error);
    enabled = false;
  }
}

function promisify<T>(
  method: (request: any, callback: (error: Error | null, response: T) => void) => void,
  request: any
): Promise<T> {
  return new Promise((resolve, reject) => {
    method.call(client, request, (error: Error | null, response: T) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}

// Balance service operations
export async function getBalance(accountId: string): Promise<GetBalanceResponse | null> {
  if (!isBalanceServiceEnabled() || !client) {
    return null;
  }

  try {
    return await promisify<GetBalanceResponse>(client.getBalance, {
      account_id: accountId,
    });
  } catch (error) {
    console.error("getBalance failed:", error);
    return null;
  }
}

export async function ensureAccount(
  accountId: string,
  initialBalance: number = 0
): Promise<EnsureAccountResponse | null> {
  if (!isBalanceServiceEnabled() || !client) {
    return null;
  }

  try {
    return await promisify<EnsureAccountResponse>(client.ensureAccount, {
      account_id: accountId,
      initial_balance: initialBalance,
    });
  } catch (error) {
    console.error("ensureAccount failed:", error);
    return null;
  }
}

export async function reserveForBuyIn(
  accountId: string,
  tableId: string,
  amount: number,
  idempotencyKey: string,
  timeoutSeconds?: number
): Promise<ReserveForBuyInResponse> {
  if (!isBalanceServiceEnabled() || !client) {
    // Fallback: allow join without balance check
    return {
      ok: true,
      reservation_id: `fallback-${Date.now()}`,
      error: "",
      available_balance: amount,
    };
  }

  try {
    return await promisify<ReserveForBuyInResponse>(client.reserveForBuyIn, {
      account_id: accountId,
      table_id: tableId,
      amount,
      idempotency_key: idempotencyKey,
      timeout_seconds: timeoutSeconds,
    });
  } catch (error) {
    console.error("reserveForBuyIn failed:", error);
    // Fallback on error
    return {
      ok: true,
      reservation_id: `fallback-${Date.now()}`,
      error: "",
      available_balance: amount,
    };
  }
}

export async function commitReservation(
  reservationId: string
): Promise<CommitReservationResponse> {
  if (!isBalanceServiceEnabled() || !client) {
    return {
      ok: true,
      transaction_id: `fallback-${Date.now()}`,
      error: "",
      new_balance: 0,
    };
  }

  // Skip fallback reservations
  if (reservationId.startsWith("fallback-")) {
    return {
      ok: true,
      transaction_id: `fallback-${Date.now()}`,
      error: "",
      new_balance: 0,
    };
  }

  try {
    return await promisify<CommitReservationResponse>(client.commitReservation, {
      reservation_id: reservationId,
    });
  } catch (error) {
    console.error("commitReservation failed:", error);
    return {
      ok: true,
      transaction_id: `fallback-${Date.now()}`,
      error: "",
      new_balance: 0,
    };
  }
}

export async function releaseReservation(
  reservationId: string,
  reason?: string
): Promise<ReleaseReservationResponse> {
  if (!isBalanceServiceEnabled() || !client) {
    return { ok: true, error: "", available_balance: 0 };
  }

  // Skip fallback reservations
  if (reservationId.startsWith("fallback-")) {
    return { ok: true, error: "", available_balance: 0 };
  }

  try {
    return await promisify<ReleaseReservationResponse>(client.releaseReservation, {
      reservation_id: reservationId,
      reason,
    });
  } catch (error) {
    console.error("releaseReservation failed:", error);
    return { ok: true, error: "", available_balance: 0 };
  }
}

export async function processCashOut(
  accountId: string,
  tableId: string,
  seatId: number,
  amount: number,
  idempotencyKey: string,
  handId?: string
): Promise<ProcessCashOutResponse> {
  if (!isBalanceServiceEnabled() || !client) {
    return {
      ok: true,
      transaction_id: `fallback-${Date.now()}`,
      error: "",
      new_balance: amount,
    };
  }

  try {
    return await promisify<ProcessCashOutResponse>(client.processCashOut, {
      account_id: accountId,
      table_id: tableId,
      seat_id: seatId,
      amount,
      idempotency_key: idempotencyKey,
      hand_id: handId,
    });
  } catch (error) {
    console.error("processCashOut failed:", error);
    return {
      ok: true,
      transaction_id: `fallback-${Date.now()}`,
      error: "",
      new_balance: amount,
    };
  }
}

export async function recordContribution(
  tableId: string,
  handId: string,
  seatId: number,
  accountId: string,
  amount: number,
  contributionType: string,
  idempotencyKey: string
): Promise<RecordContributionResponse> {
  if (!isBalanceServiceEnabled() || !client) {
    return { ok: true, error: "", total_pot: 0, seat_contribution: amount };
  }

  try {
    return await promisify<RecordContributionResponse>(client.recordContribution, {
      table_id: tableId,
      hand_id: handId,
      seat_id: seatId,
      account_id: accountId,
      amount,
      contribution_type: contributionType,
      idempotency_key: idempotencyKey,
    });
  } catch (error) {
    console.error("recordContribution failed:", error);
    return { ok: true, error: "", total_pot: 0, seat_contribution: amount };
  }
}

export async function settlePot(
  tableId: string,
  handId: string,
  winners: Array<{ seatId: number; accountId: string; amount: number }>,
  idempotencyKey: string
): Promise<SettlePotResponse> {
  if (!isBalanceServiceEnabled() || !client) {
    return { ok: true, error: "", results: [] };
  }

  try {
    return await promisify<SettlePotResponse>(client.settlePot, {
      table_id: tableId,
      hand_id: handId,
      winners: winners.map((w) => ({
        seat_id: w.seatId,
        account_id: w.accountId,
        amount: w.amount,
      })),
      idempotency_key: idempotencyKey,
    });
  } catch (error) {
    console.error("settlePot failed:", error);
    return { ok: true, error: "", results: [] };
  }
}

export async function cancelPot(
  tableId: string,
  handId: string,
  reason: string
): Promise<CancelPotResponse> {
  if (!isBalanceServiceEnabled() || !client) {
    return { ok: true, error: "" };
  }

  try {
    return await promisify<CancelPotResponse>(client.cancelPot, {
      table_id: tableId,
      hand_id: handId,
      reason,
    });
  } catch (error) {
    console.error("cancelPot failed:", error);
    return { ok: true, error: "" };
  }
}
