import { describe, expect, it } from 'vitest';
import {
  createConfigBuilder,
  readIntEnv,
  readNullableStringEnv,
  readStringEnv,
} from '../src/config';

describe('Config env utilities', () => {
  it('readIntEnv returns fallback when unset', () => {
    expect(readIntEnv({}, 'PORT', 123)).toBe(123);
  });

  it('readIntEnv picks the first valid key', () => {
    const env = { PRIMARY: 'nope', SECONDARY: '42' };
    expect(readIntEnv(env, ['PRIMARY', 'SECONDARY'], 1)).toBe(42);
  });

  it('readIntEnv enforces min/max by falling back', () => {
    expect(readIntEnv({ PORT: '0' }, 'PORT', 5000, { min: 1, max: 65535 })).toBe(5000);
    expect(readIntEnv({ PORT: '70000' }, 'PORT', 5000, { min: 1, max: 65535 })).toBe(5000);
  });

  it('readIntEnv can throw on invalid values', () => {
    expect(() => readIntEnv({ PORT: 'abc' }, 'PORT', 5000, { onInvalid: 'throw' })).toThrow();
  });

  it('readStringEnv trims and falls back on empty', () => {
    const env = { NAME: '   ' };
    expect(readStringEnv(env, 'NAME', 'fallback')).toBe('fallback');
  });

  it('readStringEnv can throw on empty when configured', () => {
    const env = { NAME: '   ' };
    expect(() => readStringEnv(env, 'NAME', 'fallback', { onEmpty: 'throw' })).toThrow();
  });

  it('readNullableStringEnv returns null when unset or empty', () => {
    expect(readNullableStringEnv({}, 'KEY')).toBeNull();
    expect(readNullableStringEnv({ KEY: '   ' }, 'KEY')).toBeNull();
  });

  it('createConfigBuilder builds a config object from env', () => {
    const env = { PORT: '5000', REDIS_URL: ' redis://other:6379 ' };
    const config = createConfigBuilder(env)
      .int('port', 'PORT', 4000)
      .string('redisUrl', 'REDIS_URL', 'redis://localhost:6379')
      .nullableString('optional', 'MISSING_KEY')
      .build();

    expect(config).toEqual({
      port: 5000,
      redisUrl: 'redis://other:6379',
      optional: null,
    });
  });
});
