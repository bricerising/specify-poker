import { once } from 'node:events';
import type { EventEmitter } from 'node:events';

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export async function waitForEvent(
  emitter: EventEmitter,
  eventName: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) {
    await once(emitter, eventName);
    return;
  }

  if (signal.aborted) {
    return;
  }

  await Promise.race([
    once(emitter, eventName).then(() => undefined),
    new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true });
    }),
  ]);
}

