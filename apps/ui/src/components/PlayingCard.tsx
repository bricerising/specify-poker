import React from "react";

import { parseCard } from "../utils/cardRenderer";

type PlayingCardSize = "sm" | "lg";

interface PlayingCardProps {
  card: string;
  size?: PlayingCardSize;
  className?: string;
}

const SUIT_NAMES: Record<string, string> = {
  h: "hearts",
  d: "diamonds",
  c: "clubs",
  s: "spades",
};

export function PlayingCard({ card, size = "sm", className = "" }: PlayingCardProps) {
  const parsed = parseCard(card);
  const sizeClass = size === "lg" ? "playing-card-lg" : "";
  const suitClass = parsed ? `playing-card-${parsed.suitColor}` : "";
  const label = parsed ? `${parsed.displayRank} of ${SUIT_NAMES[parsed.suit] ?? "unknown"}` : card;
  const classes = ["playing-card", sizeClass, suitClass, className].filter(Boolean).join(" ");

  return (
    <span className={classes} role="img" aria-label={label}>
      {parsed ? (
        <>
          <span className="playing-card-corner playing-card-corner-tl">
            <span className="playing-card-rank">{parsed.displayRank}</span>
            <span className="playing-card-suit">{parsed.suitSymbol}</span>
          </span>
          <span className="playing-card-pip">{parsed.suitSymbol}</span>
          <span className="playing-card-corner playing-card-corner-br">
            <span className="playing-card-rank">{parsed.displayRank}</span>
            <span className="playing-card-suit">{parsed.suitSymbol}</span>
          </span>
        </>
      ) : (
        <span className="playing-card-fallback">{card}</span>
      )}
    </span>
  );
}
