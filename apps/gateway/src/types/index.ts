export interface Table {
    table_id: string;
    name: string;
    owner_id: string;
    config: TableConfig;
    status: string;
    created_at: string;
}

type EmptyRequest = Record<string, never>;
type UnaryCallback<T> = (err: Error | null, response: T) => void;

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
    GetTableState(request: { table_id: string; user_id: string }, callback: UnaryCallback<{ state: TableState; hole_cards?: Card[] }>): void;
    ListTables(request: EmptyRequest, callback: UnaryCallback<{ tables: Table[] }>): void;
    CreateTable(
        request: {
            name: string;
            owner_id: string;
            config: {
                small_blind: number;
                big_blind: number;
                ante: number;
                max_players: number;
                starting_stack: number;
                turn_timer_seconds: number;
            };
        },
        callback: UnaryCallback<Record<string, unknown>>
    ): void;
    GetTable(request: { table_id: string }, callback: UnaryCallback<Record<string, unknown>>): void;
    DeleteTable(request: { table_id: string }, callback: UnaryCallback<Record<string, unknown>>): void;
    JoinSeat(request: { table_id: string; user_id: string; seat_id: number; buy_in_amount: number }, callback: UnaryCallback<{ ok: boolean; error?: string }>): void;
    LeaveSeat(request: { table_id: string; user_id: string }, callback: UnaryCallback<{ ok: boolean; error?: string }>): void;
    JoinSpectator(request: { table_id: string; user_id: string }, callback: UnaryCallback<{ ok: boolean; error?: string }>): void;
    LeaveSpectator(request: { table_id: string; user_id: string }, callback: UnaryCallback<{ ok: boolean; error?: string }>): void;
    SubmitAction(
        request: { table_id: string; user_id: string; action_type: string; amount?: number },
        callback: UnaryCallback<{ ok: boolean; state?: TableState; error?: string }>
    ): void;
    KickPlayer(request: { table_id: string; owner_id: string; target_user_id: string }, callback: UnaryCallback<Record<string, unknown>>): void;
    MutePlayer(request: { table_id: string; owner_id: string; target_user_id: string }, callback: UnaryCallback<Record<string, unknown>>): void;
    UnmutePlayer(request: { table_id: string; owner_id: string; target_user_id: string }, callback: UnaryCallback<Record<string, unknown>>): void;
    IsMuted(request: { table_id: string; user_id: string }, callback: UnaryCallback<{ is_muted: boolean }>): void;
}

export interface PlayerServiceClient {
    GetProfile(request: { user_id: string; referrer_id?: string; username?: string }, callback: UnaryCallback<{ profile: Record<string, unknown> }>): void;
    UpdateProfile(
        request: {
            user_id: string;
            nickname?: string;
            avatar_url?: string;
            preferences?: {
                sound_enabled?: boolean;
                chat_enabled?: boolean;
                show_hand_strength?: boolean;
                theme?: string;
            };
        },
        callback: UnaryCallback<{ profile: Record<string, unknown> }>
    ): void;
    DeleteProfile(request: { user_id: string }, callback: UnaryCallback<{ success: boolean }>): void;
    GetStatistics(request: { user_id: string }, callback: UnaryCallback<{ statistics: Record<string, unknown> }>): void;
    GetFriends(request: { user_id: string }, callback: UnaryCallback<{ friends: Array<Record<string, unknown>> }>): void;
    AddFriend(request: { user_id: string; friend_id: string }, callback: UnaryCallback<Record<string, unknown>>): void;
    RemoveFriend(request: { user_id: string; friend_id: string }, callback: UnaryCallback<Record<string, unknown>>): void;
    GetNicknames(request: { user_ids: string[] }, callback: UnaryCallback<{ nicknames: Array<Record<string, unknown>> }>): void;
}

export interface EventServiceClient {
    PublishEvent(
        request: {
            type: string;
            table_id: string;
            hand_id?: string;
            user_id?: string;
            seat_id?: number;
            payload: unknown;
            idempotency_key: string;
        },
        callback: UnaryCallback<{ success: boolean; event_id?: string }>
    ): void;
    PublishEvents(
        request: {
            events: Array<{
                type: string;
                table_id: string;
                hand_id?: string;
                user_id?: string;
                seat_id?: number;
                payload: unknown;
                idempotency_key: string;
            }>;
        },
        callback: UnaryCallback<{ success: boolean; event_ids: string[] }>
    ): void;
    QueryEvents(
        request: {
            table_id?: string;
            hand_id?: string;
            user_id?: string;
            types?: string[];
            start_time?: { seconds: number };
            end_time?: { seconds: number };
            limit?: number;
            offset?: number;
            cursor?: string;
        },
        callback: UnaryCallback<{ events: unknown[]; total: number; has_more: boolean; next_cursor?: string }>
    ): void;
    GetEvent(request: { event_id: string }, callback: UnaryCallback<Record<string, unknown>>): void;
    GetHandRecord(request: { hand_id: string; requester_id?: string }, callback: UnaryCallback<Record<string, unknown>>): void;
    GetHandReplay(request: { hand_id: string }, callback: UnaryCallback<{ hand_id: string; events: unknown[] }>): void;
    GetHandHistory(
        request: { table_id: string; limit?: number; offset?: number; requester_id?: string },
        callback: UnaryCallback<{ hands: unknown[]; total: number }>
    ): void;
    GetHandsForUser(
        request: { user_id: string; limit?: number; offset?: number },
        callback: UnaryCallback<{ hands: unknown[]; total: number }>
    ): void;
}

export interface NotifyServiceClient {
    RegisterSubscription(
        request: { user_id: string; subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } } },
        callback: UnaryCallback<{ ok: boolean; error?: string }>
    ): void;
    UnregisterSubscription(
        request: { user_id: string; endpoint: string },
        callback: UnaryCallback<{ ok: boolean; error?: string }>
    ): void;
    ListSubscriptions(
        request: { user_id: string },
        callback: UnaryCallback<{ subscriptions: Array<{ endpoint: string; keys?: { p256dh?: string; auth?: string } }> }>
    ): void;
    SendNotification(
        request: { user_id: string; title: string; body: string; url?: string; icon?: string; tag?: string; data?: Record<string, string> },
        callback: UnaryCallback<{ ok: boolean; success_count?: number; failure_count?: number; error?: string }>
    ): void;
}

export type BalanceServiceClient = Record<string, unknown>;
