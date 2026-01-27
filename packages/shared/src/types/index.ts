export type TableId = string;
export type UserId = string;

export type BettingStructure = "NoLimit";

export interface UserProfile {
  userId: UserId;
  nickname: string;
  avatarUrl: string | null;
  stats: {
    handsPlayed: number;
    wins: number;
  };
  friends: UserId[];
}

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number | null;
  maxPlayers: number;
  startingStack: number;
  bettingStructure: BettingStructure;
  turnTimerSeconds?: number;
}

export interface TableSummary {
  tableId: TableId;
  name: string;
  ownerId: UserId;
  config: TableConfig;
  seatsTaken: number;
  occupiedSeatIds: number[];
  inProgress: boolean;
  spectatorCount?: number;
}

export interface TableCreateRequest {
  name: string;
  config: TableConfig;
}

export interface TableJoinRequest {
  seatId: number;
}

export interface TableJoinResponse {
  tableId: TableId;
  seatId: number;
  wsUrl: string;
}

export interface ModerationRequest {
  seatId: number;
}
