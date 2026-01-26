import {
  getIdempotentResponse,
  setIdempotentResponse,
  withIdempotencyLock,
} from "../storage/idempotencyStore";

export async function withIdempotentResponse<T>(
  idempotencyKey: string,
  work: () => Promise<T>
): Promise<T> {
  const existingResponse = await getIdempotentResponse(idempotencyKey);
  if (existingResponse !== null) {
    return existingResponse as T;
  }

  return withIdempotencyLock(idempotencyKey, async () => {
    const responseAfterLock = await getIdempotentResponse(idempotencyKey);
    if (responseAfterLock !== null) {
      return responseAfterLock as T;
    }

    const result = await work();
    await setIdempotentResponse(idempotencyKey, result);
    return result;
  });
}

