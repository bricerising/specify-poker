export interface ParsedCard {
  rank: string;
  displayRank: string;
  suit: string;
  suitSymbol: string;
  suitColor: "red" | "black";
  display: string;
}

const SUIT_SYMBOLS: Record<string, string> = {
  h: "\u2665", // hearts
  d: "\u2666", // diamonds
  c: "\u2663", // clubs
  s: "\u2660", // spades
};

const SUIT_COLORS: Record<string, "red" | "black"> = {
  h: "red",
  d: "red",
  c: "black",
  s: "black",
};

const RANK_DISPLAY: Record<string, string> = {
  T: "10",
  J: "J",
  Q: "Q",
  K: "K",
  A: "A",
};

export function parseCard(card: string): ParsedCard | null {
  const normalized = card.trim();

  const rankToken =
    normalized.length === 3 && normalized.startsWith("10")
      ? "10"
      : normalized.length === 2
        ? normalized.charAt(0)
        : "";
  const suitToken =
    normalized.length === 3 && normalized.startsWith("10")
      ? normalized.charAt(2)
      : normalized.length === 2
        ? normalized.charAt(1)
        : "";

  if (!rankToken || !suitToken) {
    return null;
  }

  const rank = rankToken.toUpperCase();
  const suit = suitToken.toLowerCase();

  if (!SUIT_SYMBOLS[suit]) {
    return null;
  }

  const displayRank = rank === "10" ? "10" : (RANK_DISPLAY[rank] ?? rank);
  const suitSymbol = SUIT_SYMBOLS[suit];
  const suitColor = SUIT_COLORS[suit];

  return {
    rank,
    displayRank,
    suit,
    suitSymbol,
    suitColor,
    display: `${displayRank}${suitSymbol}`,
  };
}

export function formatCard(card: string): string {
  const parsed = parseCard(card);
  return parsed?.display ?? card;
}

export function formatCards(cards: string[]): string[] {
  return cards.map(formatCard);
}
