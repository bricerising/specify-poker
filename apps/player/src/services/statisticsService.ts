import { defaultProfile, defaultStatistics } from '../domain/defaults';
import type { Statistics } from '../domain/types';
import { ValidationError } from '../domain/errors';
import { generateNickname } from './nicknameService';
import { statisticsStore } from '../storage/statisticsStore';
import * as statisticsRepository from '../storage/statisticsRepository';
import { profileStore } from '../storage/profileStore';
import { transaction } from '../storage/db';
import * as statisticsIdempotencyRepository from '../storage/statisticsIdempotencyRepository';
import * as statisticsCache from '../storage/statisticsCache';

async function ensureProfile(userId: string) {
  const existing = await profileStore.get(userId, true);
  if (existing) {
    return;
  }

  const nickname = await generateNickname(userId);
  const profile = defaultProfile(userId, nickname, new Date());
  await profileStore.create(profile);
}

export enum StatisticType {
  HandsPlayed = 'hands_played',
  Wins = 'wins',
  Vpip = 'vpip',
  Pfr = 'pfr',
  AllIn = 'all_in',
  BiggestPot = 'biggest_pot',
  ReferralCount = 'referral_count',
}

/**
 * Immutable statistic updater - returns partial update instead of mutating.
 * This pattern improves predictability and makes testing easier.
 */
type StatisticUpdater = (stats: Readonly<Statistics>, amount: number) => Partial<Statistics>;

const statisticUpdaters: Record<StatisticType, StatisticUpdater> = {
  [StatisticType.HandsPlayed]: (stats, amount) => ({
    handsPlayed: stats.handsPlayed + Math.max(0, Math.floor(amount)),
  }),
  [StatisticType.Wins]: (stats, amount) => ({
    wins: stats.wins + Math.max(0, Math.floor(amount)),
  }),
  [StatisticType.Vpip]: (stats, amount) => ({
    vpip: Math.max(0, Math.min(100, stats.vpip + amount)),
  }),
  [StatisticType.Pfr]: (stats, amount) => ({
    pfr: Math.max(0, Math.min(100, stats.pfr + amount)),
  }),
  [StatisticType.AllIn]: (stats, amount) => ({
    allInCount: stats.allInCount + Math.max(0, Math.floor(amount)),
  }),
  [StatisticType.BiggestPot]: (stats, amount) => ({
    biggestPot: Math.max(stats.biggestPot, Math.floor(amount)),
  }),
  [StatisticType.ReferralCount]: (stats, amount) => ({
    referralCount: stats.referralCount + Math.max(0, Math.floor(amount)),
  }),
};

function applyStatisticUpdate(
  stats: Readonly<Statistics>,
  type: StatisticType,
  amount: number,
  timestamp: string,
): Statistics {
  const update = statisticUpdaters[type](stats, amount);
  return {
    ...stats,
    ...update,
    lastUpdated: timestamp,
  };
}

export async function getStatistics(userId: string): Promise<Statistics> {
  const existing = await statisticsStore.get(userId);
  if (existing) {
    return existing;
  }
  await ensureProfile(userId);
  const created = defaultStatistics(userId, new Date());
  return statisticsStore.upsert(created);
}

export async function incrementStatistic(
  userId: string,
  type: StatisticType,
  amount: number,
): Promise<Statistics> {
  const stats = await getStatistics(userId);
  const updated = applyStatisticUpdate(stats, type, amount, new Date().toISOString());
  return statisticsStore.update(updated);
}

export async function incrementStatisticIdempotent(
  userId: string,
  type: StatisticType,
  amount: number,
  idempotencyKey: string,
): Promise<Statistics> {
  const trimmedKey = idempotencyKey.trim();
  if (!trimmedKey) {
    throw new ValidationError('MISSING_IDEMPOTENCY_KEY');
  }

  await ensureProfile(userId);

  const result = await transaction(async (client) => {
    // Fast-path: return the prior result for this key (and wait for inflight callers via row lock).
    const locked = await statisticsIdempotencyRepository.lockAndGetResult(trimmedKey, client);
    if (locked) {
      return locked;
    }

    // Ensure the idempotency row exists so concurrent callers will block on the row lock.
    await statisticsIdempotencyRepository.insertIfMissing({
      idempotencyKey: trimmedKey,
      userId,
      statisticType: type,
      amount,
      client,
    });

    const existing = await statisticsIdempotencyRepository.lockAndGetResult(trimmedKey, client);
    if (existing) {
      return existing;
    }

    const now = new Date();
    const seed = defaultStatistics(userId, now);

    let stats = await statisticsRepository.findByIdForUpdate(userId, client);
    if (!stats) {
      await statisticsRepository.insertIfMissing(seed, client);
      stats = await statisticsRepository.findByIdForUpdate(userId, client);
    }

    if (!stats) {
      throw new Error('STATISTICS_NOT_FOUND');
    }

    const updated = applyStatisticUpdate(stats, type, amount, now.toISOString());
    const saved = await statisticsRepository.update(updated, client);

    await statisticsIdempotencyRepository.setResult(
      {
        idempotencyKey: trimmedKey,
        result: saved,
      },
      client,
    );

    return saved;
  });

  // Best-effort cache update (Redis optional).
  await statisticsCache.set(result);
  return result;
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
