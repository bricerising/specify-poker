import type { Statistics } from '../domain/types';
import * as statisticsCache from './statisticsCache';
import * as statisticsRepository from './statisticsRepository';

export type StatisticsStore = {
  get(userId: string): Promise<Statistics | null>;
  upsert(stats: Statistics): Promise<Statistics>;
  update(stats: Statistics): Promise<Statistics>;
  invalidate(userId: string): Promise<void>;
};

type StatisticsStoreDependencies = {
  repository: Pick<typeof statisticsRepository, 'findById' | 'upsert' | 'update'>;
  cache: Pick<typeof statisticsCache, 'get' | 'set' | 'invalidate'>;
};

export function createStatisticsStore(deps: StatisticsStoreDependencies): StatisticsStore {
  return {
    get: async (userId) => {
      const cached = await deps.cache.get(userId);
      if (cached !== null) {
        return cached;
      }

      const existing = await deps.repository.findById(userId);
      if (!existing) {
        return null;
      }

      await deps.cache.set(existing);
      return existing;
    },

    upsert: async (stats) => {
      const saved = await deps.repository.upsert(stats);
      await deps.cache.set(saved);
      return saved;
    },

    update: async (stats) => {
      const saved = await deps.repository.update(stats);
      await deps.cache.set(saved);
      return saved;
    },

    invalidate: async (userId) => {
      await deps.cache.invalidate(userId);
    },
  };
}

export const statisticsStore = createStatisticsStore({
  repository: statisticsRepository,
  cache: statisticsCache,
});
