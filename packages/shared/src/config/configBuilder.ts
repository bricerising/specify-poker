import type { Env, ReadIntEnvOptions, ReadStringEnvOptions } from './env';
import { readIntEnv, readNullableStringEnv, readStringEnv } from './env';

export class ConfigBuilder<TConfig extends Record<string, unknown>> {
  private readonly env: Env;
  private readonly config: TConfig;

  constructor(env: Env, config: TConfig) {
    this.env = env;
    this.config = config;
  }

  int<TKey extends string>(
    key: TKey,
    envKeys: readonly string[] | string,
    fallback: number,
    options?: ReadIntEnvOptions,
  ): ConfigBuilder<TConfig & Record<TKey, number>> {
    const value = readIntEnv(this.env, envKeys, fallback, options);
    const next = { ...this.config, [key]: value } as TConfig & Record<TKey, number>;
    return new ConfigBuilder(this.env, next);
  }

  string<TKey extends string>(
    key: TKey,
    envKeys: readonly string[] | string,
    fallback: string,
    options?: ReadStringEnvOptions,
  ): ConfigBuilder<TConfig & Record<TKey, string>> {
    const value = readStringEnv(this.env, envKeys, fallback, options);
    const next = { ...this.config, [key]: value } as TConfig & Record<TKey, string>;
    return new ConfigBuilder(this.env, next);
  }

  nullableString<TKey extends string>(
    key: TKey,
    envKeys: readonly string[] | string,
    fallback?: string | null,
    options?: ReadStringEnvOptions,
  ): ConfigBuilder<TConfig & Record<TKey, string | null>> {
    const value = readNullableStringEnv(this.env, envKeys, fallback, options);
    const next = { ...this.config, [key]: value } as TConfig & Record<TKey, string | null>;
    return new ConfigBuilder(this.env, next);
  }

  build(): TConfig {
    return this.config;
  }
}

function defaultEnv(): Env {
  const maybeProcess = (globalThis as unknown as { process?: { env?: Env } }).process;
  return maybeProcess?.env ?? {};
}

export function createConfigBuilder(env: Env = defaultEnv()): ConfigBuilder<Record<string, never>> {
  return new ConfigBuilder(env, {} as Record<string, never>);
}
