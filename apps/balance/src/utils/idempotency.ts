import {
  getIdempotentResponse,
  setIdempotentResponse,
  withIdempotencyLock,
} from '../storage/idempotencyStore';

export async function getCachedIdempotentResponse<T>(
  idempotencyKey: string,
  options: { decodeCached?: (cached: unknown) => T | null } = {},
): Promise<T | null> {
  const cached = await getIdempotentResponse(idempotencyKey);
  if (cached === null) {
    return null;
  }

  if (options.decodeCached) {
    return options.decodeCached(cached);
  }

  return cached as T;
}

export async function withIdempotentResponse<T>(
  idempotencyKey: string,
  work: () => Promise<T>,
  options: { decodeCached?: (cached: unknown) => T | null } = {},
): Promise<T> {
  const cached = await getCachedIdempotentResponse<T>(idempotencyKey, options);
  if (cached !== null) {
    return cached;
  }

  return withIdempotencyLock(idempotencyKey, async () => {
    const cachedAfterLock = await getCachedIdempotentResponse<T>(idempotencyKey, options);
    if (cachedAfterLock !== null) {
      return cachedAfterLock;
    }

    const result = await work();
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  });
}
