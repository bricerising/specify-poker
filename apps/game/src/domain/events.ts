/**
 * Game Event Type Constants
 *
 * Centralized event type definitions for game-related events published
 * to the event service. Using constants prevents typos and enables
 * IDE autocomplete.
 */

export const GameEventType = {
  // Table lifecycle
  TABLE_CREATED: "TABLE_CREATED",
  TABLE_DELETED: "TABLE_DELETED",

  // Seat events
  PLAYER_JOINED: "PLAYER_JOINED",
  PLAYER_LEFT: "PLAYER_LEFT",
  SPECTATOR_JOINED: "SPECTATOR_JOINED",
  SPECTATOR_LEFT: "SPECTATOR_LEFT",

  // Hand lifecycle
  HAND_STARTED: "HAND_STARTED",
  HAND_ENDED: "HAND_ENDED",
  HAND_COMPLETED: "HAND_COMPLETED",

  // Street events
  PREFLOP_DEALT: "PREFLOP_DEALT",
  FLOP_DEALT: "FLOP_DEALT",
  TURN_DEALT: "TURN_DEALT",
  RIVER_DEALT: "RIVER_DEALT",

  // Action events
  ACTION_TAKEN: "ACTION_TAKEN",
  TURN_STARTED: "TURN_STARTED",
  TURN_TIMEOUT: "TURN_TIMEOUT",

  // Showdown events
  CARDS_SHOWN: "CARDS_SHOWN",
  POT_AWARDED: "POT_AWARDED",

  // Moderation events
  PLAYER_KICKED: "PLAYER_KICKED",
  PLAYER_MUTED: "PLAYER_MUTED",
  PLAYER_UNMUTED: "PLAYER_UNMUTED",

  // Error events
  BALANCE_UNAVAILABLE: "BALANCE_UNAVAILABLE",
  CASHOUT_FAILED: "CASHOUT_FAILED",
  SETTLEMENT_FAILED: "SETTLEMENT_FAILED",
} as const;

export type GameEventType = (typeof GameEventType)[keyof typeof GameEventType];
