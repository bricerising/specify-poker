import { defaultProfile, defaultStatistics } from '../domain/defaults';
import type { Statistics } from '../domain/types';
import { generateNickname } from './nicknameService';
import { statisticsStore } from '../storage/statisticsStore';
import { profileStore } from '../storage/profileStore';

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

type StatisticUpdater = (stats: Statistics, amount: number) => void;

const statisticUpdaters: Record<StatisticType, StatisticUpdater> = {
  [StatisticType.HandsPlayed]: (stats, amount) => {
    stats.handsPlayed += Math.max(0, Math.floor(amount));
  },
  [StatisticType.Wins]: (stats, amount) => {
    stats.wins += Math.max(0, Math.floor(amount));
  },
  [StatisticType.Vpip]: (stats, amount) => {
    stats.vpip = Math.max(0, Math.min(100, stats.vpip + amount));
  },
  [StatisticType.Pfr]: (stats, amount) => {
    stats.pfr = Math.max(0, Math.min(100, stats.pfr + amount));
  },
  [StatisticType.AllIn]: (stats, amount) => {
    stats.allInCount += Math.max(0, Math.floor(amount));
  },
  [StatisticType.BiggestPot]: (stats, amount) => {
    stats.biggestPot = Math.max(stats.biggestPot, Math.floor(amount));
  },
  [StatisticType.ReferralCount]: (stats, amount) => {
    stats.referralCount += Math.max(0, Math.floor(amount));
  },
};

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
  statisticUpdaters[type](stats, amount);

  stats.lastUpdated = new Date().toISOString();
  return statisticsStore.update(stats);
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
