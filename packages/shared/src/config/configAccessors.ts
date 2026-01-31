import { createLazyValue } from '../lifecycle/lazyValue';

export type ConfigAccessors<TConfig> = {
  getConfig(): TConfig;
  resetConfigForTests(): void;
};

/**
 * Factory Method: builds a small facade around a config loader with a stable API
 * (`getConfig`, `resetConfigForTests`) and lazy caching.
 *
 * This keeps config modules free of repeated caching boilerplate while keeping
 * the actual config shape and parsing logic local to each service.
 */
export function createConfigAccessors<TConfig>(loadConfig: () => TConfig): ConfigAccessors<TConfig> {
  const cachedConfig = createLazyValue(loadConfig);

  return {
    getConfig: () => cachedConfig.get(),
    resetConfigForTests: () => cachedConfig.reset(),
  };
}

