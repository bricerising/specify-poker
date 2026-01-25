import { z } from "zod";

export const schemaVersion = "0.1.0";

export const bettingStructureSchema = z.literal("NoLimit");

export const tableConfigSchema = z
  .object({
    smallBlind: z.number().int().positive(),
    bigBlind: z.number().int().positive(),
    ante: z.number().int().nonnegative().nullable().optional(),
    maxPlayers: z.number().int().min(2).max(9),
    startingStack: z.number().int().positive(),
    bettingStructure: bettingStructureSchema.default("NoLimit"),
    turnTimerSeconds: z.number().int().positive().optional(),
  })
  .refine((data) => data.bigBlind >= data.smallBlind * 2, {
    message: "bigBlind must be >= 2 * smallBlind",
    path: ["bigBlind"],
  })
  .refine((data) => data.ante == null || data.ante < data.smallBlind, {
    message: "ante must be < smallBlind",
    path: ["ante"],
  });

export const userProfileSchema = z.object({
  userId: z.string(),
  nickname: z.string().min(2).max(20),
  avatarUrl: z.string().url().nullable(),
  stats: z.object({
    handsPlayed: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
  }),
  friends: z.array(z.string()),
});

export const tableSummarySchema = z.object({
  tableId: z.string(),
  name: z.string().min(1),
  ownerId: z.string(),
  config: tableConfigSchema,
  seatsTaken: z.number().int().nonnegative(),
  occupiedSeatIds: z.array(z.number().int().min(0).max(8)),
  inProgress: z.boolean(),
  spectatorCount: z.number().int().nonnegative().default(0),
});

export const tableCreateRequestSchema = z.object({
  name: z.string().min(1),
  config: tableConfigSchema,
});

export const tableJoinRequestSchema = z.object({
  seatId: z.number().int().min(0).max(8),
});

export const tableJoinResponseSchema = z.object({
  tableId: z.string(),
  seatId: z.number().int().min(0).max(8),
  wsUrl: z.string(),
});

export const moderationRequestSchema = z.object({
  seatId: z.number().int().min(0).max(8),
});

export const wsActionSchema = z.enum(["Fold", "Check", "Call", "Bet", "Raise"]);

export const wsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Authenticate"), token: z.string().min(1) }),
  z.object({ type: z.literal("SubscribeTable"), tableId: z.string().min(1) }),
  z.object({ type: z.literal("UnsubscribeTable"), tableId: z.string().min(1) }),
  z.object({ type: z.literal("ResyncTable"), tableId: z.string().min(1) }),
  z.object({
    type: z.literal("JoinSeat"),
    tableId: z.string().min(1),
    seatId: z.number().int().min(0).max(8),
    buyInAmount: z.unknown().optional(),
  }),
  z.object({ type: z.literal("LeaveTable"), tableId: z.string().min(1) }),
  z.object({
    type: z.literal("Action"),
    tableId: z.string().min(1),
    handId: z.string().min(1).optional(),
    action: z.string(),
    amount: z.unknown().optional(),
  }),
  z.object({ type: z.literal("SubscribeChat"), tableId: z.string().min(1) }),
  z.object({ type: z.literal("UnsubscribeChat"), tableId: z.string().min(1) }),
  z.object({ type: z.literal("ChatSend"), tableId: z.string().min(1), message: z.string() }),
]);

export const tableSeatViewSchema = z
  .object({
    seatId: z.number().int().min(0).max(8),
    userId: z.string().min(1).nullable(),
    stack: z.number(),
    status: z.string(),
  })
  .passthrough();

export const spectatorViewSchema = z
  .object({
    userId: z.string().min(1),
    status: z.string(),
    joinedAt: z.string().optional(),
  })
  .passthrough();

export const tablePotSchema = z
  .object({
    amount: z.number(),
    eligibleSeatIds: z.array(z.number().int().min(0).max(8)),
    winners: z.array(z.number().int().min(0).max(8)).optional(),
  })
  .passthrough();

export const tableHandActionSchema = z
  .object({
    actionId: z.string().min(1),
    handId: z.string().min(1),
    seatId: z.number().int().min(0).max(8),
    userId: z.string(),
    type: z.string(),
    amount: z.number(),
    timestamp: z.string(),
  })
  .passthrough();

export const tableHandStateSchema = z
  .object({
    handId: z.string().min(1),
    tableId: z.string().min(1),
    street: z.string().min(1),
    communityCards: z.array(z.unknown()).default([]),
    pots: z.array(tablePotSchema).default([]),
    currentBet: z.number(),
    minRaise: z.number(),
    turn: z.number().int().min(0).max(8),
    lastAggressor: z.number().int().min(0).max(8),
    actions: z.array(tableHandActionSchema).default([]),
    rakeAmount: z.number().default(0),
    startedAt: z.string(),
    winners: z.array(z.number().int().min(0).max(8)).optional(),
    endedAt: z.string().nullable().optional(),
  })
  .passthrough();

export const tableStateViewSchema = z
  .object({
    tableId: z.string().min(1),
    name: z.string(),
    ownerId: z.string(),
    config: tableConfigSchema,
    status: z.string(),
    hand: tableHandStateSchema.nullable(),
    version: z.number().int(),
    seats: z.array(tableSeatViewSchema),
    spectators: z.array(spectatorViewSchema).default([]),
    updatedAt: z.string(),
    button: z.number().int().min(0).max(8),
  })
  .passthrough();

export const wsServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Welcome"), userId: z.string(), connectionId: z.string() }),
  z.object({
    type: z.literal("Error"),
    code: z.string().optional(),
    message: z.string(),
    correlationId: z.string().optional(),
  }),
  z.object({ type: z.literal("LobbyTablesUpdated"), tables: z.array(tableSummarySchema) }),
  z.object({ type: z.literal("TableSnapshot"), tableState: tableStateViewSchema }),
  z.object({
    type: z.literal("TablePatch"),
    tableId: z.string().min(1),
    handId: z.string().optional(),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("HoleCards"),
    tableId: z.string().min(1),
    handId: z.string().optional(),
    seatId: z.number().int().min(0).max(8).optional(),
    cards: z.array(z.unknown()),
  }),
  z.object({
    type: z.literal("ActionResult"),
    tableId: z.string().min(1),
    handId: z.string().optional(),
    accepted: z.boolean(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("ChatSubscribed"),
    tableId: z.string().min(1),
    history: z.array(z.unknown()).optional(),
  }),
  z.object({ type: z.literal("ChatError"), tableId: z.string().min(1), reason: z.string() }),
  z.object({
    type: z.literal("ChatMessage"),
    tableId: z.string().min(1),
    message: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("TimerUpdate"),
    tableId: z.string().min(1),
    handId: z.string().min(1),
    currentTurnSeat: z.number().int().min(0).max(8),
    deadlineTs: z.string().min(1),
  }),
  z.object({
    type: z.literal("SpectatorJoined"),
    tableId: z.string().min(1),
    userId: z.string().min(1),
    username: z.string().optional(),
    spectatorCount: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("SpectatorLeft"),
    tableId: z.string().min(1),
    userId: z.string().min(1),
    spectatorCount: z.number().int().nonnegative().optional(),
  }),
]);
