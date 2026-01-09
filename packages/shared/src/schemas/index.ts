import { z } from "zod";

export const schemaVersion = "0.1.0";

export const tableConfigSchema = z.object({
  smallBlind: z.number().int().positive(),
  bigBlind: z.number().int().positive(),
  ante: z.number().int().nonnegative().nullable().optional(),
  maxPlayers: z.number().int().min(2).max(9),
  startingStack: z.number().int().positive(),
  bettingStructure: z.literal("NoLimit"),
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
  config: tableConfigSchema,
  seatsTaken: z.number().int().nonnegative(),
  inProgress: z.boolean(),
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
  targetUserId: z.string(),
});
