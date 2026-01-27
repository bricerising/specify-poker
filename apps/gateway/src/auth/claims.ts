export function normalizeUsernameFromClaims(claims: Record<string, unknown> | undefined): string | null {
  const candidates = [
    claims?.preferred_username,
    claims?.username,
    claims?.nickname,
    claims?.email,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}

