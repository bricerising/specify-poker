export interface ParsedCard {
  rank: string;
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
  if (card.length !== 2) {
    return null;
  }
  const rank = card[0];
  const suit = card[1].toLowerCase();

  if (!SUIT_SYMBOLS[suit]) {
    return null;
  }

  const displayRank = RANK_DISPLAY[rank] ?? rank;
  const suitSymbol = SUIT_SYMBOLS[suit];
  const suitColor = SUIT_COLORS[suit];

  return {
    rank,
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
