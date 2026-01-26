export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number | null;
  maxPlayers: number;
  startingStack: number;
  bettingStructure: "NoLimit";
}

export interface TableSummary {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  seatsTaken: number;
  occupiedSeatIds: number[];
  inProgress: boolean;
  spectatorCount?: number;
}

export interface SpectatorView {
  userId: string;
  username?: string;
  status: "active" | "disconnected";
}

export interface TableSeat {
  seatId: number;
  userId: string | null;
  username?: string;
  avatarUrl?: string | null;
  stack: number;
  status: string;
}

export interface HandState {
  handId: string;
  currentStreet: string;
  currentTurnSeat: number;
  currentBet: number;
  minRaise: number;
  raiseCapped: boolean;
  roundContributions: Record<number, number>;
  actedSeats: number[];
  communityCards: string[];
  pots: { amount: number; eligibleSeatIds: number[] }[];
  actionTimerDeadline: string | null;
  bigBlind: number;
  winners?: number[];
}

export interface TableState {
  tableId: string;
  name: string;
  ownerId: string;
  config: TableConfig;
  seats: TableSeat[];
  spectators?: SpectatorView[];
  status: string;
  hand: HandState | null;
  button: number;
  version: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username?: string;
  text: string;
  ts: string;
}

export interface TableStoreState {
  tables: TableSummary[];
  tableState: TableState | null;
  seatId: number | null;
  isSpectating: boolean;
  status: "idle" | "connecting" | "connected" | "error";
  error?: string;
  chatMessages: ChatMessage[];
  chatError?: string;
  privateHoleCards: string[] | null;
  privateHandId: string | null;
}

export interface TableStore {
  getState(): TableStoreState;
  subscribe(listener: (state: TableStoreState) => void): () => void;
  fetchTables(): Promise<void>;
  subscribeLobby(): void;
  joinSeat(tableId: string, seatId: number): Promise<void>;
  spectateTable(tableId: string): void;
  leaveTable(): void;
  subscribeTable(tableId: string): void;
  sendAction(action: { type: string; amount?: number }): void;
  subscribeChat(tableId: string): void;
  sendChat(message: string): void;
}

