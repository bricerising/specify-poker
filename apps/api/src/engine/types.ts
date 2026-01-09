import { TableConfig } from "../services/tableTypes";

export type SeatStatus = "empty" | "active" | "folded" | "all_in" | "disconnected";
export type HandStreet = "preflop" | "flop" | "turn" | "river" | "showdown" | "ended";
export type HandActionType = "Fold" | "Check" | "Call" | "Bet" | "Raise";

export interface TableSeat {
  seatId: number;
  userId: string | null;
  stack: number;
  status: SeatStatus;
}

export interface Pot {
  amount: number;
  eligibleSeatIds: number[];
}

export interface HandState {
  handId: string;
  tableId: string;
  buttonSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  communityCards: string[];
  pots: Pot[];
  currentStreet: HandStreet;
  currentTurnSeat: number;
  currentBet: number;
  minRaise: number;
  roundContributions: Record<number, number>;
  totalContributions: Record<number, number>;
  actedSeats: number[];
  actionTimerDeadline: string | null;
  startedAt: string;
  endedAt: string | null;
  deck: string[];
  holeCards: Record<number, [string, string]>;
  bigBlind: number;
  winners?: number[];
}

export interface TableState {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  seats: TableSeat[];
  status: "lobby" | "in_hand";
  hand: HandState | null;
  version: number;
}

export interface HandActionInput {
  type: HandActionType;
  amount?: number;
}
