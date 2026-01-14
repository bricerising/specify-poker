import { defaultProfile, defaultStatistics } from "../domain/defaults";
import { Statistics } from "../domain/types";
import * as statisticsRepository from "../storage/statisticsRepository";
import * as statisticsCache from "../storage/statisticsCache";
import * as profileRepository from "../storage/profileRepository";
import * as profileCache from "../storage/profileCache";
import { generateNickname } from "./nicknameService";

async function ensureProfile(userId: string) {
  const existing = await profileRepository.findById(userId, true);
  if (existing) {
    return;
  }

  const nickname = await generateNickname(userId);
  const profile = defaultProfile(userId, nickname, new Date());
  try {
    const created = await profileRepository.create(profile);
    await profileCache.set(created);
  } catch (error: unknown) {
    const code = typeof error === "object" && error ? (error as { code?: unknown }).code : undefined;
    if (code !== "23505") {
      throw error;
    }
    const existingAfter = await profileRepository.findById(userId, true);
    if (existingAfter) {
      await profileCache.set(existingAfter);
      return;
    }
    throw error;
  }
}

export enum StatisticType {
  HandsPlayed = "hands_played",
  Wins = "wins",
  Vpip = "vpip",
  Pfr = "pfr",
  AllIn = "all_in",
  BiggestPot = "biggest_pot",
  ReferralCount = "referral_count",
}

export async function getStatistics(userId: string): Promise<Statistics> {
  const cached = await statisticsCache.get(userId);
  if (cached) {
    return cached;
  }
  const existing = await statisticsRepository.findById(userId);
  if (existing) {
    await statisticsCache.set(existing);
    return existing;
  }
  await ensureProfile(userId);
  const created = defaultStatistics(userId, new Date());
  const saved = await statisticsRepository.upsert(created);
  await statisticsCache.set(saved);
  return saved;
}

export async function incrementStatistic(
  userId: string,
  type: StatisticType,
  amount: number
): Promise<Statistics> {
  const stats = await getStatistics(userId);
  switch (type) {
    case StatisticType.HandsPlayed:
      stats.handsPlayed += Math.max(0, Math.floor(amount));
      break;
    case StatisticType.Wins:
      stats.wins += Math.max(0, Math.floor(amount));
      break;
    case StatisticType.Vpip:
      stats.vpip = Math.max(0, Math.min(100, stats.vpip + amount));
      break;
    case StatisticType.Pfr:
      stats.pfr = Math.max(0, Math.min(100, stats.pfr + amount));
      break;
    case StatisticType.AllIn:
      stats.allInCount += Math.max(0, Math.floor(amount));
      break;
    case StatisticType.BiggestPot:
      stats.biggestPot = Math.max(stats.biggestPot, Math.floor(amount));
      break;
    case StatisticType.ReferralCount:
      stats.referralCount += Math.max(0, Math.floor(amount));
      break;
    default:
      break;
  }

  stats.lastUpdated = new Date().toISOString();
  const saved = await statisticsRepository.update(stats);
  await statisticsCache.set(saved);
  return saved;
}

export async function incrementHandsPlayed(userId: string): Promise<Statistics> {
  return incrementStatistic(userId, StatisticType.HandsPlayed, 1);
}

export async function incrementWins(userId: string): Promise<Statistics> {
  return incrementStatistic(userId, StatisticType.Wins, 1);
}

export async function incrementReferralCount(userId: string, amount: number): Promise<Statistics> {
  return incrementStatistic(userId, StatisticType.ReferralCount, amount);
}
