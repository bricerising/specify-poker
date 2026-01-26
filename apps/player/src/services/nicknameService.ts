import { findByNickname } from "../storage/profileRepository";
import { getUserIdByNickname } from "../storage/profileCache";
import { ValidationError } from "../domain/errors";

const MIN_NICKNAME_LENGTH = 1;
const MAX_NICKNAME_LENGTH = 30;
const NICKNAME_PATTERN = /^[a-zA-Z0-9_\- ]+$/;

export function validateNickname(nickname: string): void {
  const trimmed = nickname.trim();
  if (trimmed.length < MIN_NICKNAME_LENGTH || trimmed.length > MAX_NICKNAME_LENGTH) {
    throw new ValidationError("Nickname must be between 1 and 30 characters");
  }
  if (!NICKNAME_PATTERN.test(trimmed)) {
    throw new ValidationError("Nickname contains invalid characters");
  }
}

export async function isAvailable(nickname: string): Promise<boolean> {
  const cached = await getUserIdByNickname(nickname);
  if (cached) {
    return false;
  }
  const existing = await findByNickname(nickname);
  return !existing;
}

export async function generateNickname(seed: string): Promise<string> {
  const base = seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "Player";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `Player${base}${suffix}`.slice(0, MAX_NICKNAME_LENGTH);
    if (await isAvailable(candidate)) {
      return candidate;
    }
  }
  return `Player${Date.now().toString(36)}`.slice(0, MAX_NICKNAME_LENGTH);
}
