export type Env = Record<string, string | undefined>;

export type ReadIntEnvOptions = {
  min?: number;
  max?: number;
  /**
   * - "fallback" (default): ignore invalid values and continue to next key; if none are valid, return fallback.
   * - "throw": throw an Error if a non-empty value is present but invalid.
   */
  onInvalid?: 'fallback' | 'throw';
};

export type ReadBoolEnvOptions = {
  /**
   * - "fallback" (default): ignore invalid values and continue to next key; if none are valid, return fallback.
   * - "throw": throw an Error if a non-empty value is present but invalid.
   */
  onInvalid?: 'fallback' | 'throw';
};

export type ReadStringEnvOptions = {
  trim?: boolean;
  /**
   * - "fallback" (default): treat empty strings as not set and continue to next key; if none are set, return fallback.
   * - "throw": throw an Error if a key is present but empty.
   */
  onEmpty?: 'fallback' | 'throw';
};

function asKeyList(keys: readonly string[] | string): readonly string[] {
  return typeof keys === 'string' ? [keys] : keys;
}

function formatEnvKeyList(keys: readonly string[]): string {
  return keys.length === 1 ? keys[0] : keys.join(' | ');
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function parseBoolean(value: string): boolean | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return null;
}

export function readIntEnv(
  env: Env,
  keys: readonly string[] | string,
  fallback: number,
  options: ReadIntEnvOptions = {},
): number {
  const keyList = asKeyList(keys);
  const onInvalid = options.onInvalid ?? 'fallback';

  for (const key of keyList) {
    const raw = env[key];
    if (raw === undefined) {
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const parsed = parseInteger(trimmed);
    if (parsed === null) {
      if (onInvalid === 'throw') {
        throw new Error(`${key} must be an integer (got "${trimmed}")`);
      }
      continue;
    }

    if (options.min !== undefined && parsed < options.min) {
      if (onInvalid === 'throw') {
        throw new Error(`${key} must be >= ${options.min} (got "${trimmed}")`);
      }
      continue;
    }
    if (options.max !== undefined && parsed > options.max) {
      if (onInvalid === 'throw') {
        throw new Error(`${key} must be <= ${options.max} (got "${trimmed}")`);
      }
      continue;
    }

    return parsed;
  }

  return fallback;
}

export function readBoolEnv(
  env: Env,
  keys: readonly string[] | string,
  fallback: boolean,
  options: ReadBoolEnvOptions = {},
): boolean {
  const keyList = asKeyList(keys);
  const onInvalid = options.onInvalid ?? 'fallback';

  for (const key of keyList) {
    const raw = env[key];
    if (raw === undefined) {
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const parsed = parseBoolean(trimmed);
    if (parsed === null) {
      if (onInvalid === 'throw') {
        throw new Error(
          `${key} must be a boolean ("true"/"false"/"1"/"0"/"yes"/"no"/"on"/"off") (got "${trimmed}")`,
        );
      }
      continue;
    }

    return parsed;
  }

  return fallback;
}

export function readStringEnv(
  env: Env,
  keys: readonly string[] | string,
  fallback: string,
  options: ReadStringEnvOptions = {},
): string {
  const keyList = asKeyList(keys);
  const onEmpty = options.onEmpty ?? 'fallback';
  const trim = options.trim ?? true;

  for (const key of keyList) {
    const raw = env[key];
    if (raw === undefined) {
      continue;
    }

    const maybeTrimmed = trim ? raw.trim() : raw;
    if (maybeTrimmed.length === 0) {
      if (onEmpty === 'throw') {
        throw new Error(`${key} must be a non-empty string`);
      }
      continue;
    }

    return maybeTrimmed;
  }

  return fallback;
}

export function readNullableStringEnv(
  env: Env,
  keys: readonly string[] | string,
  fallback: string | null = null,
  options: ReadStringEnvOptions = {},
): string | null {
  const keyList = asKeyList(keys);
  const onEmpty = options.onEmpty ?? 'fallback';
  const trim = options.trim ?? true;

  for (const key of keyList) {
    const raw = env[key];
    if (raw === undefined) {
      continue;
    }

    const maybeTrimmed = trim ? raw.trim() : raw;
    if (maybeTrimmed.length === 0) {
      if (onEmpty === 'throw') {
        throw new Error(`${formatEnvKeyList(keyList)} must be a non-empty string`);
      }
      continue;
    }

    return maybeTrimmed;
  }

  return fallback;
}
