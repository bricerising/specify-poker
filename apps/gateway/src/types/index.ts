export interface Table {
    table_id: string;
    name: string;
    owner_id: string;
    config: TableConfig;
    status: string;
    created_at: string;
}

export interface TableConfig {
    smallBlind: number;
    bigBlind: number;
    ante: number;
    maxPlayers: number;
    startingStack: number;
    turnTimerSeconds: number;
}

export interface TableState {
    table_id: string;
    seats: Seat[];
    spectators: Spectator[];
    hand: HandState | null;
    button: number;
    version: number;
    updated_at: string;
}

export interface Seat {
    seat_id: number;
    user_id: string | null;
    stack: number;
    status: string;
    hole_cards?: Card[];
}

export interface Spectator {
    user_id: string;
    status: string;
    joined_at: string;
}

export interface HandState {
    hand_id: string;
    table_id: string;
    street: string;
    community_cards: Card[];
    pots: Pot[];
    current_bet: number;
    min_raise: number;
    turn: number;
    last_aggressor: number;
    rake_amount: number;
    started_at: string;
    winners?: number[];
    ended_at?: string;
}

export interface Card {
    rank: string;
    suit: string;
}

export interface Pot {
    amount: number;
    eligible_seats: number[];
    winners?: number[];
}

export interface GameServiceClient {
    GetTableState(request: { table_id: string; user_id: string }, callback: (err: Error | null, response: { state: TableState, hole_cards?: Card[] }) => void): void;
    ListTables(request: Record<string, never>, callback: (err: Error | null, response: { tables: Table[] }) => void): void;
    JoinSeat(request: { table_id: string; user_id: string; seat_id: number; buy_in_amount: number }, callback: (err: Error | null, response: { ok: boolean; error?: string }) => void): void;
    LeaveSeat(request: { table_id: string; user_id: string }, callback: (err: Error | null, response: { ok: boolean; error?: string }) => void): void;
    JoinSpectator(request: { table_id: string; user_id: string }, callback: (err: Error | null, response: { ok: boolean }) => void): void;
    LeaveSpectator(request: { table_id: string; user_id: string }, callback: (err: Error | null, response: { ok: boolean }) => void): void;
    SubmitAction(request: { table_id: string; user_id: string; action_type: string; amount?: number }, callback: (err: Error | null, response: { ok: boolean; state?: TableState; error?: string }) => void): void;
    IsMuted(request: { table_id: string; user_id: string }, callback: (err: Error | null, response: { is_muted: boolean }) => void): void;
}

export interface PlayerServiceClient {
    GetProfile(request: { user_id: string }, callback: (err: Error | null, response: { profile: { nickname: string } }) => void): void;
}

export interface EventServiceClient {
    PublishEvent(request: any, callback: (err: Error | null, response: { success: boolean }) => void): void;
}

export interface BalanceServiceClient {
    // Add methods as needed
}
