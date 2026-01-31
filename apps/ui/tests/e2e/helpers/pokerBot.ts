import type { APIRequestContext } from '@playwright/test';

import { deriveLegalActions, type ActionType } from '../../../src/state/deriveLegalActions';
import { cardToString, normalizeTableState, normalizeTableSummary } from '../../../src/state/tableNormalization';
import type { TableState, TableSummary } from '../../../src/state/tableTypes';
import { asRecord, readTrimmedString, type UnknownRecord } from '../../../src/utils/unknown';
import { gatewayJson } from './http';

type Rng = () => number;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = Math.imul(hash, 0x01000193);
    // eslint-disable-next-line no-bitwise
    hash >>>= 0;
  }
  return hash;
}

function createRng(seed: string): Rng {
  // eslint-disable-next-line no-bitwise
  let state = fnv1a32(seed) || 0x12345678;
  return () => {
    // xorshift32
    // eslint-disable-next-line no-bitwise
    state ^= state << 13;
    // eslint-disable-next-line no-bitwise
    state ^= state >>> 17;
    // eslint-disable-next-line no-bitwise
    state ^= state << 5;
    // eslint-disable-next-line no-bitwise
    state >>>= 0;
    return state / 0xffffffff;
  };
}

type ParsedCard = { rank: number; suit: string };

function rankToValue(rank: string): number {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  if (rank === 'T') return 10;
  const parsed = Number(rank);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseCard(card: string): ParsedCard | null {
  const trimmed = card.trim();
  if (trimmed.length < 2) return null;
  const rankChar = trimmed.slice(0, trimmed.length - 1);
  const suitChar = trimmed.slice(-1);
  const rankValue = rankToValue(rankChar);
  if (!Number.isFinite(rankValue)) return null;
  return { rank: rankValue, suit: suitChar };
}

function hasStraight(ranks: number[]): boolean {
  const unique = Array.from(new Set(ranks)).sort((a, b) => a - b);
  const hasAce = unique.includes(14);
  const wheelAdjusted = hasAce ? Array.from(new Set([...unique, 1])).sort((a, b) => a - b) : unique;

  let run = 1;
  for (let i = 1; i < wheelAdjusted.length; i += 1) {
    if (wheelAdjusted[i] === wheelAdjusted[i - 1] + 1) {
      run += 1;
      if (run >= 5) return true;
      continue;
    }
    run = 1;
  }
  return false;
}

function estimateStrength(options: { holeCards?: string[] | null; communityCards?: string[] }): number {
  const holeCards = options.holeCards?.filter((card) => typeof card === 'string') ?? [];
  const communityCards = options.communityCards?.filter((card) => typeof card === 'string') ?? [];

  const parsedHole = holeCards.map(parseCard).filter((card): card is ParsedCard => Boolean(card));
  if (parsedHole.length !== 2) {
    return 0.5;
  }

  if (communityCards.length === 0) {
    const a = parsedHole[0];
    const b = parsedHole[1];
    const high = Math.max(a.rank, b.rank);
    const low = Math.min(a.rank, b.rank);
    const pair = a.rank === b.rank;
    const suited = a.suit === b.suit;
    const gap = Math.abs(a.rank - b.rank);

    let score = (high + low) / (2 * 14);
    if (pair) {
      score += 0.35 + (high / 14) * 0.2;
    }
    if (suited) {
      score += 0.05;
    }
    if (gap === 1) score += 0.05;
    if (gap === 2) score += 0.03;
    if (high >= 10 && low >= 10) score += 0.05;
    return clamp01(score);
  }

  const parsedAll = [...holeCards, ...communityCards]
    .map(parseCard)
    .filter((card): card is ParsedCard => Boolean(card));
  const ranks = parsedAll.map((c) => c.rank);
  const suits = parsedAll.map((c) => c.suit);

  const rankCounts = new Map<number, number>();
  for (const rank of ranks) {
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  }
  const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);
  const pairs = counts.filter((count) => count >= 2).length;
  const hasTrips = counts.some((count) => count >= 3);
  const hasQuads = counts.some((count) => count >= 4);

  const suitCounts = new Map<string, number>();
  for (const suit of suits) {
    suitCounts.set(suit, (suitCounts.get(suit) ?? 0) + 1);
  }
  const hasFlush = Array.from(suitCounts.values()).some((count) => count >= 5);
  const straight = hasStraight(ranks);

  const hasFullHouse = hasTrips && pairs >= 2;

  let category = 0; // high card
  if (hasQuads) category = 7;
  else if (hasFullHouse) category = 6;
  else if (hasFlush) category = 5;
  else if (straight) category = 4;
  else if (hasTrips) category = 3;
  else if (pairs >= 2) category = 2;
  else if (pairs === 1) category = 1;

  const baseByCategory = [0.32, 0.46, 0.56, 0.66, 0.71, 0.76, 0.86, 0.92] as const;
  const base = baseByCategory[category] ?? 0.5;
  const kicker = Math.max(...ranks) / 14;
  return clamp01(base + kicker * 0.06);
}

function assertInvariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export type PokerBotProfile = Readonly<{
  name: string;
  tightness: number;
  aggression: number;
  bluffFrequency: number;
  raiseSizing: number;
  randomness: number;
  stallFrequency: number;
  timeoutFrequency: number;
  thinkTimeMs: { min: number; max: number };
}>;

export const botProfiles = {
  tightPassive: {
    name: 'tight-passive',
    tightness: 0.85,
    aggression: 0.15,
    bluffFrequency: 0.05,
    raiseSizing: 0.25,
    randomness: 0.2,
    stallFrequency: 0.2,
    timeoutFrequency: 0.05,
    thinkTimeMs: { min: 10, max: 80 },
  },
  tightAggressive: {
    name: 'tight-aggressive',
    tightness: 0.75,
    aggression: 0.7,
    bluffFrequency: 0.08,
    raiseSizing: 0.55,
    randomness: 0.2,
    stallFrequency: 0.12,
    timeoutFrequency: 0.03,
    thinkTimeMs: { min: 10, max: 60 },
  },
  looseAggressive: {
    name: 'loose-aggressive',
    tightness: 0.25,
    aggression: 0.85,
    bluffFrequency: 0.25,
    raiseSizing: 0.7,
    randomness: 0.35,
    stallFrequency: 0.08,
    timeoutFrequency: 0.02,
    thinkTimeMs: { min: 0, max: 40 },
  },
  maniac: {
    name: 'maniac',
    tightness: 0.05,
    aggression: 0.98,
    bluffFrequency: 0.55,
    raiseSizing: 0.9,
    randomness: 0.45,
    stallFrequency: 0.05,
    timeoutFrequency: 0.01,
    thinkTimeMs: { min: 0, max: 25 },
  },
} satisfies Record<string, PokerBotProfile>;

type BotAction = { type: ActionType; amount?: number };
type BotDecision = { kind: 'action'; action: BotAction } | { kind: 'timeout' };

function toGatewayActionType(action: ActionType): string {
  return action.toUpperCase();
}

function normalizeSeatStatus(status: string | null | undefined): string {
  return String(status ?? '').trim().toUpperCase();
}

function readRoundContribution(hand: NonNullable<TableState['hand']>, seatId: number): number {
  const record = hand.roundContributions as unknown as Record<string, unknown>;
  const value = record[String(seatId)] ?? 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readRoundContributions(
  hand: NonNullable<TableState['hand']>,
  seatIds: number[],
): Record<number, number> {
  const contributions: Record<number, number> = {};
  for (const seatId of seatIds) {
    contributions[seatId] = readRoundContribution(hand, seatId);
  }
  return contributions;
}

function nextActiveSeat(
  seats: Array<{ seatId: number; status: string }>,
  startSeatId: number,
): number {
  const total = seats.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const seatId = (startSeatId + offset) % total;
    if (normalizeSeatStatus(seats[seatId]?.status) === 'ACTIVE') {
      return seatId;
    }
  }
  return startSeatId;
}

function isBettingRoundComplete(params: {
  currentBet: number;
  seats: Array<{ seatId: number; status: string }>;
  actedSeats: number[];
  roundContributions: Record<number, number>;
}): boolean {
  if (params.currentBet === 0) {
    for (const seat of params.seats) {
      if (normalizeSeatStatus(seat.status) !== 'ACTIVE') {
        continue;
      }
      if (!params.actedSeats.includes(seat.seatId)) {
        return false;
      }
    }
    return true;
  }

  for (const seat of params.seats) {
    if (normalizeSeatStatus(seat.status) !== 'ACTIVE') {
      continue;
    }
    const contribution = params.roundContributions[seat.seatId] ?? 0;
    if (contribution < params.currentBet) {
      return false;
    }
  }

  return true;
}

type ExpectedOutcome =
  | {
      kind: 'in_hand';
      handId: string;
      street: string;
      currentTurnSeat: number;
      currentBet: number;
      minRaise: number;
      raiseCapped: boolean;
      actedSeats: number[];
      roundContributions: Record<number, number>;
      actor: { seatId: number; status: string; stack: number };
      expectedActionType: string;
    }
  | {
      kind: 'hand_complete';
      handId: string;
      reason: 'fold' | 'showdown' | 'river';
      expectedActionType: string;
    };

const STREET_PROGRESSION: Readonly<Record<string, string>> = {
  PREFLOP: 'FLOP',
  FLOP: 'TURN',
  TURN: 'RIVER',
  RIVER: 'SHOWDOWN',
  SHOWDOWN: 'SHOWDOWN',
};

function expectedOutcomeFor(params: {
  before: TableState;
  actorSeatId: number;
  action: BotAction;
}): ExpectedOutcome {
  const hand = params.before.hand;
  if (!hand) {
    throw new Error('Expected a hand to be in progress.');
  }

  const seats = params.before.seats.map((seat) => ({
    seatId: seat.seatId,
    userId: seat.userId,
    status: seat.status,
    stack: seat.stack,
  }));

  const seatIds = seats.map((seat) => seat.seatId);
  const contributions = readRoundContributions(hand, seatIds);
  const actedSeats = [...(hand.actedSeats ?? [])];

  const actor = seats[params.actorSeatId];
  if (!actor || actor.seatId !== params.actorSeatId) {
    throw new Error(`Expected actor seat ${params.actorSeatId} to exist.`);
  }

  const previousMinRaise = hand.minRaise;
  let currentBet = hand.currentBet;
  let minRaise = hand.minRaise;
  let raiseCapped = hand.raiseCapped;
  let resetActedSeats = false;

  const contributed = contributions[params.actorSeatId] ?? 0;
  const statusBefore = normalizeSeatStatus(actor.status);

  if (params.action.type === 'Fold') {
    actor.status = 'FOLDED';
  } else if (params.action.type === 'Check') {
    // no-op
  } else if (params.action.type === 'Call') {
    const toCall = Math.max(0, currentBet - contributed);
    const amount = Math.min(toCall, actor.stack);
    actor.stack -= amount;
    contributions[params.actorSeatId] = contributed + amount;
    if (actor.stack === 0 && statusBefore === 'ACTIVE') {
      actor.status = 'ALL_IN';
    }
  } else if (params.action.type === 'Bet') {
    const amount = Math.max(0, Math.floor(params.action.amount ?? 0));
    const betAmount = Math.min(amount, actor.stack);
    actor.stack -= betAmount;
    currentBet = betAmount;
    minRaise = betAmount;
    raiseCapped = false;
    contributions[params.actorSeatId] = betAmount;
    resetActedSeats = true;
    if (actor.stack === 0 && statusBefore === 'ACTIVE') {
      actor.status = 'ALL_IN';
    }
  } else if (params.action.type === 'Raise') {
    const amount = Math.max(0, Math.floor(params.action.amount ?? currentBet));
    const maxTotal = actor.stack + contributed;
    const raiseAmount = Math.min(amount, maxTotal);
    const raiseSize = raiseAmount - currentBet;
    const additional = raiseAmount - contributed;
    actor.stack -= Math.max(0, additional);
    currentBet = raiseAmount;
    if (raiseSize >= previousMinRaise) {
      minRaise = raiseSize;
      raiseCapped = false;
      resetActedSeats = true;
    } else {
      raiseCapped = true;
    }
    contributions[params.actorSeatId] = raiseAmount;
    if (actor.stack === 0 && statusBefore === 'ACTIVE') {
      actor.status = 'ALL_IN';
    }
  }

  const nextActedSeats = (() => {
    if (resetActedSeats) {
      return [params.actorSeatId];
    }
    return actedSeats.includes(params.actorSeatId) ? actedSeats : [...actedSeats, params.actorSeatId];
  })();

  const remainingSeats = seats.filter((seat) => {
    const status = normalizeSeatStatus(seat.status);
    return status === 'ACTIVE' || status === 'ALL_IN';
  });
  if (remainingSeats.length === 1) {
    return {
      kind: 'hand_complete',
      handId: hand.handId,
      reason: 'fold',
      expectedActionType: toGatewayActionType(params.action.type),
    };
  }

  const activeSeats = seats.filter((seat) => normalizeSeatStatus(seat.status) === 'ACTIVE');
  const shouldShowdown =
    activeSeats.length === 0 || (activeSeats.length === 1 && remainingSeats.length > 1);
  if (shouldShowdown) {
    return {
      kind: 'hand_complete',
      handId: hand.handId,
      reason: 'showdown',
      expectedActionType: toGatewayActionType(params.action.type),
    };
  }

  const roundComplete = isBettingRoundComplete({
    currentBet,
    seats,
    actedSeats: nextActedSeats,
    roundContributions: contributions,
  });

  if (!roundComplete) {
    return {
      kind: 'in_hand',
      handId: hand.handId,
      street: hand.currentStreet,
      currentTurnSeat: nextActiveSeat(seats, params.actorSeatId),
      currentBet,
      minRaise,
      raiseCapped,
      actedSeats: nextActedSeats,
      roundContributions: contributions,
      actor: {
        seatId: params.actorSeatId,
        status: actor.status,
        stack: actor.stack,
      },
      expectedActionType: toGatewayActionType(params.action.type),
    };
  }

  if (hand.currentStreet === 'RIVER') {
    return {
      kind: 'hand_complete',
      handId: hand.handId,
      reason: 'river',
      expectedActionType: toGatewayActionType(params.action.type),
    };
  }

  const nextStreet = STREET_PROGRESSION[hand.currentStreet] ?? hand.currentStreet;
  const resetContributions: Record<number, number> = {};
  for (const seat of seats) {
    resetContributions[seat.seatId] = 0;
  }

  return {
    kind: 'in_hand',
    handId: hand.handId,
    street: nextStreet,
    currentTurnSeat: nextActiveSeat(seats, params.before.button),
    currentBet: 0,
    minRaise: hand.bigBlind,
    raiseCapped: false,
    actedSeats: [],
    roundContributions: resetContributions,
    actor: {
      seatId: params.actorSeatId,
      status: actor.status,
      stack: actor.stack,
    },
    expectedActionType: toGatewayActionType(params.action.type),
  };
}

function amountBetween(min: number | undefined, max: number | undefined, factor: number) {
  if (min === undefined && max === undefined) {
    return undefined;
  }
  if (min !== undefined && max === undefined) {
    return Math.floor(min);
  }
  if (min === undefined && max !== undefined) {
    return Math.floor(max);
  }
  const range = (max as number) - (min as number);
  return Math.floor((min as number) + range * clamp01(factor));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDeadlineMs(deadline: string | null): number | null {
  if (!deadline) {
    return null;
  }
  const parsed = Date.parse(deadline);
  return Number.isFinite(parsed) ? parsed : null;
}

async function thinkDelay(profile: PokerBotProfile, rng: Rng, deadlineMs: number | null) {
  const { min, max } = profile.thinkTimeMs;
  const resolvedMin = Math.max(0, Math.floor(min));
  const resolvedMax = Math.max(resolvedMin, Math.floor(max));
  let ms = resolvedMin + Math.floor((resolvedMax - resolvedMin) * rng());

  if (deadlineMs !== null && rng() < clamp01(profile.stallFrequency)) {
    const remainingMs = deadlineMs - Date.now();
    const safetyMs = 175;
    if (remainingMs > safetyMs + 20) {
      const stallFraction = 0.6 + rng() * 0.35;
      ms = Math.max(ms, Math.floor(remainingMs * stallFraction));
    }
    ms = Math.min(ms, Math.max(0, remainingMs - safetyMs));
  }

  if (ms > 0) {
    await sleep(ms);
  }
}

export class PokerTestBot {
  readonly userId: string;
  readonly username: string;
  readonly token: string;
  readonly seatId: number;
  readonly profile: PokerBotProfile;
  private readonly rng: Rng;

  constructor(options: {
    userId: string;
    username: string;
    token: string;
    seatId: number;
    profile: PokerBotProfile;
    rngSeed?: string;
  }) {
    this.userId = options.userId;
    this.username = options.username;
    this.token = options.token;
    this.seatId = options.seatId;
    this.profile = options.profile;
    this.rng = createRng(options.rngSeed ?? `${options.userId}:${options.profile.name}`);
  }

  async decideAction(
    tableState: TableState,
    holeCards?: string[] | null,
  ): Promise<BotDecision | null> {
    const actions = deriveLegalActions(tableState, this.seatId);
    if (actions.length === 0) {
      return null;
    }

    const hand = tableState.hand;
    if (!hand) {
      return null;
    }

    const deadlineMs = parseDeadlineMs(hand.actionTimerDeadline);
    if (deadlineMs !== null && this.rng() < clamp01(this.profile.timeoutFrequency)) {
      return { kind: 'timeout' };
    }

    const seat = tableState.seats.find((entry) => entry.seatId === this.seatId);
    if (!seat) {
      return null;
    }

    const contributed = hand.roundContributions[this.seatId] ?? 0;
    const toCall = Math.max(0, hand.currentBet - contributed);

    const rawStrength = estimateStrength({ holeCards, communityCards: hand.communityCards });
    const strengthNoise = (this.rng() - 0.5) * 0.25 * clamp01(this.profile.randomness);
    const strength = clamp01(rawStrength + strengthNoise);

    const fold = actions.find((entry) => entry.type === 'Fold');
    const check = actions.find((entry) => entry.type === 'Check');
    const call = actions.find((entry) => entry.type === 'Call');
    const bet = actions.find((entry) => entry.type === 'Bet');
    const raise = actions.find((entry) => entry.type === 'Raise');

    const sizingBase = clamp01(this.profile.raiseSizing * 0.6 + strength * 0.4);
    const sizingNoise = (this.rng() - 0.5) * 0.2 * clamp01(this.profile.randomness);
    const sizing = clamp01(sizingBase + sizingNoise);

    if (toCall > 0) {
      const price = toCall / Math.max(1, seat.stack + toCall);
      const continueThreshold = 0.32 + clamp01(this.profile.tightness) * 0.28 + price * 0.25;
      if (fold && strength < continueThreshold) {
        await thinkDelay(this.profile, this.rng, deadlineMs);
        return { kind: 'action', action: { type: 'Fold' } };
      }

      if (raise) {
        const raiseChance = clamp01(
          clamp01(this.profile.aggression) * (0.25 + strength * 0.75) +
            clamp01(this.profile.bluffFrequency) * (1 - strength) * 0.35,
        );
        if (this.rng() < raiseChance) {
          await thinkDelay(this.profile, this.rng, deadlineMs);
          const amount = amountBetween(raise.minAmount, raise.maxAmount, sizing);
          return { kind: 'action', action: { type: 'Raise', amount } };
        }
      }

      if (call) {
        await thinkDelay(this.profile, this.rng, deadlineMs);
        return { kind: 'action', action: { type: 'Call' } };
      }

      if (check) {
        await thinkDelay(this.profile, this.rng, deadlineMs);
        return { kind: 'action', action: { type: 'Check' } };
      }
    }

    if (bet || raise) {
      const aggressiveChance = clamp01(
        clamp01(this.profile.aggression) * (0.15 + strength * 0.85) +
          clamp01(this.profile.bluffFrequency) * (1 - strength) * 0.25,
      );
      if (this.rng() < aggressiveChance) {
        await thinkDelay(this.profile, this.rng, deadlineMs);
        if (bet) {
          const amount = amountBetween(bet.minAmount, bet.maxAmount, sizing);
          return { kind: 'action', action: { type: 'Bet', amount } };
        }
        if (raise) {
          const amount = amountBetween(raise.minAmount, raise.maxAmount, sizing);
          return { kind: 'action', action: { type: 'Raise', amount } };
        }
      }
    }

    if (check) {
      await thinkDelay(this.profile, this.rng, deadlineMs);
      return { kind: 'action', action: { type: 'Check' } };
    }

    if (call) {
      await thinkDelay(this.profile, this.rng, deadlineMs);
      return { kind: 'action', action: { type: 'Call' } };
    }

    if (fold) {
      await thinkDelay(this.profile, this.rng, deadlineMs);
      return { kind: 'action', action: { type: 'Fold' } };
    }

    return null;
  }
}

type GatewayTableStateResponse = {
  state?: UnknownRecord;
  hole_cards?: unknown[];
  holeCards?: unknown[];
};

type TableSnapshot = {
  tableState: TableState;
  rawState: UnknownRecord;
  holeCards: string[] | null;
};

function extractHoleCards(payload: GatewayTableStateResponse): string[] | null {
  const cards = Array.isArray(payload.hole_cards)
    ? payload.hole_cards
    : Array.isArray(payload.holeCards)
      ? payload.holeCards
      : null;

  if (!cards) return null;
  const normalized = cards
    .map((card) => cardToString(card))
    .filter((card): card is string => Boolean(card));
  return normalized.length > 0 ? normalized : null;
}

async function fetchTableState(
  request: APIRequestContext,
  tableId: string,
  token: string,
  fallback?: TableSummary,
): Promise<TableSnapshot> {
  const payload = await gatewayJson<GatewayTableStateResponse>(request, `/api/tables/${tableId}/state`, {
    token,
  });
  const state = payload.state ?? {};
  return {
    tableState: normalizeTableState(state as UnknownRecord, fallback),
    rawState: state as UnknownRecord,
    holeCards: extractHoleCards(payload),
  };
}

async function fetchTableSummary(
  request: APIRequestContext,
  tableId: string,
  token: string,
): Promise<TableSummary> {
  const table = await gatewayJson<UnknownRecord>(request, `/api/tables/${tableId}`, { token });
  return normalizeTableSummary(table);
}

function readRawHand(rawState: UnknownRecord): UnknownRecord | null {
  return asRecord(rawState.hand);
}

function readRawHandId(rawState: UnknownRecord): string | null {
  const hand = readRawHand(rawState);
  const handId = readTrimmedString(hand?.hand_id ?? hand?.handId);
  return handId ?? null;
}

function readRawHandEndedAt(rawState: UnknownRecord): string | null {
  const hand = readRawHand(rawState);
  const endedAt = readTrimmedString(hand?.ended_at ?? hand?.endedAt);
  return endedAt ?? null;
}

function readRawHandActions(rawState: UnknownRecord): UnknownRecord[] {
  const hand = readRawHand(rawState);
  if (!hand) {
    return [];
  }
  return Array.isArray(hand.actions) ? (hand.actions as UnknownRecord[]) : [];
}

function readRawLastAction(rawState: UnknownRecord): UnknownRecord | null {
  const actions = readRawHandActions(rawState);
  if (actions.length === 0) {
    return null;
  }
  const last = actions[actions.length - 1];
  return last && typeof last === 'object' ? last : null;
}

function readRawActionSeatId(action: UnknownRecord): number | null {
  const raw = action.seat_id ?? action.seatId;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readRawActionType(action: UnknownRecord): string | null {
  const value = readTrimmedString(action.type);
  return value ? value.toUpperCase() : null;
}

function readRawActionHandId(action: UnknownRecord): string | null {
  const value = readTrimmedString(action.hand_id ?? action.handId);
  return value ?? null;
}

function readRawActionAmount(action: UnknownRecord): number | null {
  const raw = action.amount;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function waitForHandActionAppend(params: {
  request: APIRequestContext;
  tableId: string;
  token: string;
  handId: string;
  baselineActionsLen: number;
  baselineVersion: number;
  timeoutMs: number;
  fallback?: TableSummary;
}): Promise<TableSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < params.timeoutMs) {
    const snapshot = await fetchTableState(params.request, params.tableId, params.token, params.fallback);
    const actions = readRawHandActions(snapshot.rawState);
    const version = snapshot.tableState.version ?? 0;
    const nextHandId = readRawHandId(snapshot.rawState);

    if (
      version > params.baselineVersion ||
      actions.length > params.baselineActionsLen ||
      nextHandId !== params.handId
    ) {
      return snapshot;
    }
    await sleep(25);
  }

  throw new Error(
    `Timed out waiting for action append on table ${params.tableId} (hand=${params.handId}) after ${params.timeoutMs}ms.`,
  );
}

function hasFullRoundContributions(before: TableState): boolean {
  const hand = before.hand;
  if (!hand) return false;
  const record = hand.roundContributions as unknown as Record<string, unknown>;
  if (!record || typeof record !== 'object') return false;
  if (Object.keys(record).length === 0) return false;
  for (const seat of before.seats) {
    const value = record[String(seat.seatId)];
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return false;
    }
  }
  return true;
}

function actionForTimeout(before: TableState, actorSeatId: number): BotAction {
  const hand = before.hand;
  if (!hand) {
    return { type: 'Fold' };
  }
  const seat = before.seats.find((entry) => entry.seatId === actorSeatId);
  if (!seat) {
    return { type: 'Fold' };
  }
  const normalizedStatus = normalizeSeatStatus(seat.status);
  if (normalizedStatus !== 'ACTIVE') {
    return { type: 'Fold' };
  }
  const contributed = readRoundContribution(hand, actorSeatId);
  const toCall = Math.max(0, hand.currentBet - contributed);
  return toCall <= 0 ? { type: 'Check' } : { type: 'Fold' };
}

function assertActionReflected(params: {
  tableId: string;
  handId: string;
  actorSeatId: number;
  expectedActionType: string;
  expectedAmount?: number;
  after: TableSnapshot;
}) {
  const last = readRawLastAction(params.after.rawState);
  assertInvariant(last, `No hand actions found after move on table ${params.tableId}.`);

  const lastHandId = readRawActionHandId(last);
  const lastSeatId = readRawActionSeatId(last);
  const lastType = readRawActionType(last);

  assertInvariant(
    lastHandId === params.handId,
    `Expected last action handId=${params.handId}, got ${String(lastHandId)}.`,
  );
  assertInvariant(
    lastSeatId === params.actorSeatId,
    `Expected last action seatId=${params.actorSeatId}, got ${String(lastSeatId)}.`,
  );
  assertInvariant(
    lastType === params.expectedActionType,
    `Expected last action type=${params.expectedActionType}, got ${String(lastType)}.`,
  );

  if (params.expectedAmount !== undefined) {
    const lastAmount = readRawActionAmount(last);
    assertInvariant(
      lastAmount === params.expectedAmount,
      `Expected last action amount=${params.expectedAmount}, got ${String(lastAmount)}.`,
    );
  }
}

export async function playHandsWithBots(
  request: APIRequestContext,
  options: {
    tableId: string;
    bots: PokerTestBot[];
    handsToComplete: number;
    timeoutMs?: number;
  },
): Promise<{ handsCompleted: number }> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const startedAt = Date.now();

  if (options.bots.length < 2) {
    throw new Error('playHandsWithBots requires at least 2 bots.');
  }

  const botsBySeat = new Map(options.bots.map((bot) => [bot.seatId, bot]));

  const observerToken = options.bots[0].token;
  const tableSummary = await fetchTableSummary(request, options.tableId, observerToken);

  let lastHandId: string | null = null;
  let lastVersion = -1;
  let handsCompleted = 0;
  let lastHandledSignature: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const beforeSnapshot = await fetchTableState(request, options.tableId, observerToken, tableSummary);
    const tableState = beforeSnapshot.tableState;
    const hand = tableState.hand;

    if (!hand) {
      await sleep(50);
      continue;
    }

    if (!lastHandId) {
      lastHandId = hand.handId;
    } else if (hand.handId && hand.handId !== lastHandId) {
      handsCompleted += 1;
      lastHandId = hand.handId;
      lastHandledSignature = null;
      if (handsCompleted >= options.handsToComplete) {
        return { handsCompleted };
      }
    }

    const version = tableState.version ?? 0;
    if (version < lastVersion) {
      lastVersion = version;
    }

    const turnSeat = hand.currentTurnSeat;
    const actor = botsBySeat.get(turnSeat) ?? null;
    if (!actor) {
      await sleep(50);
      continue;
    }

    const signature = `${hand.handId}:${turnSeat}:${version}:${hand.currentBet}:${hand.minRaise}`;
    if (signature === lastHandledSignature) {
      await sleep(25);
      continue;
    }

    const actorView = await fetchTableState(request, options.tableId, actor.token, tableSummary);
    const decision = await actor.decideAction(actorView.tableState, actorView.holeCards);
    if (!decision) {
      await sleep(25);
      continue;
    }

    const baselineActionsLen = readRawHandActions(beforeSnapshot.rawState).length;
    const baselineHandId = hand.handId;

    lastHandledSignature = signature;

    const effectiveAction =
      decision.kind === 'timeout' ? actionForTimeout(tableState, turnSeat) : decision.action;
    const expectedActionType =
      decision.kind === 'timeout' && !hasFullRoundContributions(tableState)
        ? null
        : toGatewayActionType(effectiveAction.type);

    const strictExpected =
      hasFullRoundContributions(tableState)
        ? expectedOutcomeFor({ before: tableState, actorSeatId: turnSeat, action: effectiveAction })
        : null;

    if (decision.kind === 'timeout') {
      const deadlineMs = parseDeadlineMs(actorView.tableState.hand?.actionTimerDeadline ?? null);
      const jitterMs = 50 + (fnv1a32(signature) % 100);
      if (deadlineMs !== null) {
        await sleep(Math.max(0, deadlineMs - Date.now() + jitterMs));
      } else {
        await sleep(250);
      }
    } else {
      const actionType = toGatewayActionType(decision.action.type);
      await gatewayJson<{ ok: boolean }>(request, `/api/tables/${options.tableId}/action`, {
        token: actor.token,
        method: 'POST',
        data: { actionType, amount: decision.action.amount },
      });
    }

	    const afterApplied = await waitForHandActionAppend({
	      request,
	      tableId: options.tableId,
	      token: observerToken,
	      handId: baselineHandId,
	      baselineActionsLen,
	      baselineVersion: version,
	      timeoutMs: decision.kind === 'timeout' ? 20_000 : 10_000,
	      fallback: tableSummary,
	    });

    const afterHand = afterApplied.tableState.hand;
    if (!afterHand || afterHand.handId !== baselineHandId) {
      lastVersion = afterApplied.tableState.version ?? lastVersion;
      continue;
    }

    const afterActionsLen = readRawHandActions(afterApplied.rawState).length;
    if (afterActionsLen <= baselineActionsLen) {
      lastVersion = afterApplied.tableState.version ?? lastVersion;
      continue;
    }

    const endedAt = readRawHandEndedAt(afterApplied.rawState);

    if (expectedActionType) {
      assertActionReflected({
        tableId: options.tableId,
        handId: baselineHandId,
        actorSeatId: turnSeat,
        expectedActionType,
        expectedAmount:
          effectiveAction.type === 'Bet' || effectiveAction.type === 'Raise'
            ? Math.max(0, Math.floor(effectiveAction.amount ?? 0))
            : undefined,
        after: afterApplied,
      });
    } else {
      const last = readRawLastAction(afterApplied.rawState);
      assertInvariant(last, `No hand actions found after timeout on table ${options.tableId}.`);
      const lastSeatId = readRawActionSeatId(last);
      const lastType = readRawActionType(last);
      assertInvariant(
        lastSeatId === turnSeat,
        `Expected timeout action seatId=${turnSeat}, got ${String(lastSeatId)}.`,
      );
      assertInvariant(
        lastType === 'CHECK' || lastType === 'FOLD',
        `Expected timeout action type CHECK|FOLD, got ${String(lastType)}.`,
      );
    }

    if (endedAt === null) {
      const beforeSeat = tableState.seats.find((entry) => entry.seatId === turnSeat) ?? null;
      const afterSeat = afterApplied.tableState.seats.find((entry) => entry.seatId === turnSeat) ?? null;
      assertInvariant(beforeSeat && afterSeat, `Expected actor seat ${turnSeat} to exist in snapshots.`);
      assertInvariant(
        afterSeat.stack <= beforeSeat.stack,
        `Expected actor stack to not increase (before=${beforeSeat.stack}, after=${afterSeat.stack}).`,
      );

      if (effectiveAction.type === 'Check') {
        assertInvariant(
          afterSeat.stack === beforeSeat.stack,
          `Expected stack unchanged on CHECK (before=${beforeSeat.stack}, after=${afterSeat.stack}).`,
        );
      }

      if (effectiveAction.type === 'Bet' && effectiveAction.amount !== undefined) {
        const betAmount = Math.max(0, Math.floor(effectiveAction.amount));
        assertInvariant(
          afterSeat.stack === beforeSeat.stack - betAmount,
          `Expected BET to deduct ${betAmount} chips (before=${beforeSeat.stack}, after=${afterSeat.stack}).`,
        );
        assertInvariant(
          afterHand.currentBet === betAmount,
          `Expected currentBet=${betAmount} after BET, got ${afterHand.currentBet}.`,
        );
      }

      if (effectiveAction.type === 'Raise' && effectiveAction.amount !== undefined) {
        const raiseAmount = Math.max(0, Math.floor(effectiveAction.amount));
        assertInvariant(
          afterHand.currentBet === raiseAmount,
          `Expected currentBet=${raiseAmount} after RAISE, got ${afterHand.currentBet}.`,
        );
        const delta = beforeSeat.stack - afterSeat.stack;
        assertInvariant(
          delta >= 0 && delta <= raiseAmount,
          `Expected raise to deduct between 0..${raiseAmount} chips (delta=${delta}).`,
        );
      }

      if (tableState.hand?.currentStreet !== afterHand.currentStreet) {
        assertInvariant(afterHand.currentBet === 0, `Expected currentBet=0 after street advance.`);
        assertInvariant(
          afterHand.minRaise === afterHand.bigBlind,
          `Expected minRaise=bigBlind after street advance (minRaise=${afterHand.minRaise}, bigBlind=${afterHand.bigBlind}).`,
        );
      }

      assertInvariant(
        afterHand.currentTurnSeat !== turnSeat,
        `Expected turn to advance from seat ${turnSeat}, but it did not.`,
      );
    }

    if (strictExpected) {
      if (strictExpected.kind === 'hand_complete') {
        assertInvariant(
          endedAt !== null || afterApplied.tableState.hand === null,
          `Expected hand ${baselineHandId} to complete (${strictExpected.reason}), but it is still running.`,
        );
      } else {
        assertInvariant(
          endedAt === null && afterApplied.tableState.hand !== null,
          `Expected hand ${baselineHandId} to remain in progress, but it ended.`,
        );
        assertInvariant(
          afterHand.handId === strictExpected.handId,
          `Expected handId=${strictExpected.handId}, got ${afterHand.handId}.`,
        );
        assertInvariant(
          afterHand.currentStreet === strictExpected.street,
          `Expected street=${strictExpected.street}, got ${afterHand.currentStreet}.`,
        );
        assertInvariant(
          afterHand.currentTurnSeat === strictExpected.currentTurnSeat,
          `Expected turn=${strictExpected.currentTurnSeat}, got ${afterHand.currentTurnSeat}.`,
        );
        assertInvariant(
          afterHand.currentBet === strictExpected.currentBet,
          `Expected currentBet=${strictExpected.currentBet}, got ${afterHand.currentBet}.`,
        );
        assertInvariant(
          afterHand.minRaise === strictExpected.minRaise,
          `Expected minRaise=${strictExpected.minRaise}, got ${afterHand.minRaise}.`,
        );
        assertInvariant(
          afterHand.raiseCapped === strictExpected.raiseCapped,
          `Expected raiseCapped=${String(strictExpected.raiseCapped)}, got ${String(afterHand.raiseCapped)}.`,
        );
        const strictSeat =
          afterApplied.tableState.seats.find((entry) => entry.seatId === turnSeat) ?? null;
        assertInvariant(strictSeat, `Expected actor seat ${turnSeat} to exist after action.`);
        assertInvariant(
          normalizeSeatStatus(strictSeat.status) === normalizeSeatStatus(strictExpected.actor.status),
          `Expected actor status=${strictExpected.actor.status}, got ${strictSeat.status}.`,
        );
        assertInvariant(
          strictSeat.stack === strictExpected.actor.stack,
          `Expected actor stack=${strictExpected.actor.stack}, got ${strictSeat.stack}.`,
        );
        const afterContribution = readRoundContribution(afterHand, turnSeat);
        const expectedContribution = strictExpected.roundContributions[turnSeat] ?? 0;
        assertInvariant(
          afterContribution === expectedContribution,
          `Expected contribution[${turnSeat}]=${expectedContribution}, got ${afterContribution}.`,
        );
        const actualActed = new Set(afterHand.actedSeats ?? []);
        const expectedActed = new Set(strictExpected.actedSeats ?? []);
        assertInvariant(
          actualActed.size === expectedActed.size && Array.from(expectedActed).every((id) => actualActed.has(id)),
          `Expected actedSeats=${JSON.stringify(Array.from(expectedActed))}, got ${JSON.stringify(Array.from(actualActed))}.`,
        );
      }
    }

    lastVersion = afterApplied.tableState.version ?? lastVersion;
  }

  throw new Error(
    `Timed out playing ${options.handsToComplete} hands on table ${options.tableId} after ${timeoutMs}ms (completed=${handsCompleted}).`,
  );
}
