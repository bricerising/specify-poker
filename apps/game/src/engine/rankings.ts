import { Card } from "../domain/types";

const rankMap: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function normalizeRank(rank: string): number {
  const normalized = rank.toUpperCase();
  const mapped = rankMap[normalized];
  if (mapped) {
    return mapped;
  }
  throw new Error(`Unknown rank: ${rank}`);
}

function normalizeSuit(suit: string): string {
  return suit.trim().charAt(0).toUpperCase();
}

interface ParsedCard {
  rank: number;
  suit: string;
}

export interface HandRank {
  category: number;
  tiebreaker: number[];
}

export interface WinnerResult {
  winners: number[];
  rank: HandRank;
}

function parseCard(card: Card): ParsedCard {
  return {
    rank: normalizeRank(card.rank),
    suit: normalizeSuit(card.suit),
  };
}

function compareRanks(a: HandRank, b: HandRank) {
  if (a.category !== b.category) {
    return a.category - b.category;
  }
  for (let i = 0; i < Math.max(a.tiebreaker.length, b.tiebreaker.length); i += 1) {
    const diff = (a.tiebreaker[i] ?? 0) - (b.tiebreaker[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function isStraight(ranks: number[]) {
  const sorted = Array.from(new Set(ranks)).sort((a, b) => b - a);
  if (sorted.length < 5) {
    return null;
  }
  for (let i = 0; i <= sorted.length - 5; i += 1) {
    const window = sorted.slice(i, i + 5);
    if (window[0] - window[4] === 4) {
      return window[0];
    }
  }
  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((rank) => sorted.includes(rank))) {
    return 5;
  }
  return null;
}

export function evaluateFiveCardHand(cards: Card[]): HandRank {
  const parsed = cards.map(parseCard);
  const ranks = parsed.map((card) => card.rank).sort((a, b) => b - a);
  const suits = parsed.map((card) => card.suit);
  const flush = suits.every((suit) => suit === suits[0]);
  const straightHigh = isStraight(ranks);

  const counts = new Map<number, number>();
  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (a[1] !== b[1]) {
      return b[1] - a[1];
    }
    return b[0] - a[0];
  });

  if (straightHigh && flush) {
    return { category: 8, tiebreaker: [straightHigh] };
  }

  if (groups[0][1] === 4) {
    const kicker = groups.find(([, count]) => count === 1)?.[0] ?? 0;
    return { category: 7, tiebreaker: [groups[0][0], kicker] };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { category: 6, tiebreaker: [groups[0][0], groups[1][0]] };
  }

  if (flush) {
    return { category: 5, tiebreaker: ranks };
  }

  if (straightHigh) {
    return { category: 4, tiebreaker: [straightHigh] };
  }

  if (groups[0][1] === 3) {
    const kickers = groups.filter(([, count]) => count === 1).map(([rank]) => rank);
    return { category: 3, tiebreaker: [groups[0][0], ...kickers] };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const kicker = groups.find(([, count]) => count === 1)?.[0] ?? 0;
    return { category: 2, tiebreaker: [groups[0][0], groups[1][0], kicker] };
  }

  if (groups[0][1] === 2) {
    const kickers = groups.filter(([, count]) => count === 1).map(([rank]) => rank);
    return { category: 1, tiebreaker: [groups[0][0], ...kickers] };
  }

  return { category: 0, tiebreaker: ranks };
}

function* combinations<T>(items: T[], choose: number): Generator<T[]> {
  const count = items.length;
  const indices = Array.from({ length: choose }, (_, index) => index);
  while (true) {
    yield indices.map((index) => items[index]);
    let i = choose - 1;
    while (i >= 0 && indices[i] === i + count - choose) {
      i -= 1;
    }
    if (i < 0) {
      return;
    }
    indices[i] += 1;
    for (let j = i + 1; j < choose; j += 1) {
      indices[j] = indices[j - 1] + 1;
    }
  }
}

export function evaluateBestHand(cards: Card[]): HandRank {
  let best: HandRank | null = null;
  for (const combo of combinations(cards, 5)) {
    const rank = evaluateFiveCardHand(combo);
    if (!best || compareRanks(rank, best) > 0) {
      best = rank;
    }
  }
  if (!best) {
    throw new Error("No hand combos available");
  }
  return best;
}

export function evaluateWinners(players: Record<number, Card[]>, communityCards: Card[]): WinnerResult {
  let bestRank: HandRank | null = null;
  let winners: number[] = [];

  for (const [seatId, holeCards] of Object.entries(players)) {
    const rank = evaluateBestHand([...holeCards, ...communityCards]);
    if (!bestRank || compareRanks(rank, bestRank) > 0) {
      bestRank = rank;
      winners = [Number(seatId)];
    } else if (bestRank && compareRanks(rank, bestRank) === 0) {
      winners.push(Number(seatId));
    }
  }

  if (!bestRank) {
    throw new Error("No players to evaluate");
  }

  return { winners, rank: bestRank };
}
