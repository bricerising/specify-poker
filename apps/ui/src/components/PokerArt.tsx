import React from "react";

interface PokerArtProps {
  variant?: "hero" | "table";
}

export function PokerArt({ variant = "hero" }: PokerArtProps) {
  const size = variant === "hero" ? 280 : 220;
  return (
    <svg
      className={`poker-art poker-art-${variant}`}
      width={size}
      height={size}
      viewBox="0 0 320 260"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="card-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--card)" />
          <stop offset="100%" stopColor="var(--card-soft)" />
        </linearGradient>
      </defs>
      <rect x="22" y="36" width="118" height="168" rx="14" fill="url(#card-shine)" />
      <rect x="36" y="52" width="90" height="4" rx="2" fill="var(--card-ink)" opacity="0.3" />
      <rect x="36" y="64" width="70" height="4" rx="2" fill="var(--card-ink)" opacity="0.2" />
      <rect x="160" y="18" width="118" height="168" rx="14" fill="url(#card-shine)" />
      <rect x="176" y="34" width="84" height="4" rx="2" fill="var(--card-ink)" opacity="0.3" />
      <rect x="176" y="46" width="54" height="4" rx="2" fill="var(--card-ink)" opacity="0.2" />
      <circle cx="72" cy="186" r="44" fill="var(--chip-outer)" />
      <circle cx="72" cy="186" r="32" fill="var(--chip-inner)" />
      <circle cx="72" cy="186" r="18" fill="var(--chip-core)" />
      <circle cx="238" cy="190" r="48" fill="var(--chip-outer)" />
      <circle cx="238" cy="190" r="35" fill="var(--chip-inner)" />
      <circle cx="238" cy="190" r="20" fill="var(--chip-core)" />
      <path
        d="M262 110c10 18 8 44-4 62-12 18-32 26-54 26"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M88 120c12-18 36-30 60-28 22 2 40 12 52 28"
        stroke="var(--accent-2)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
    </svg>
  );
}
