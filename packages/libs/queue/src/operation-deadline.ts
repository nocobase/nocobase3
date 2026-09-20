import { AsyncLocalStorage } from 'node:async_hooks';

export const PRODUCER_REQUEST_TIMEOUT_MS: number = 10000;
export const producerDeadline: AsyncLocalStorage<number> =
  new AsyncLocalStorage<number>();

/** Bound the caller's wait without cancelling or abandoning the operation. */
export async function waitForProducerDeadline<T>(
  operation: Promise<T>,
  deadline: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    const check = (): void => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        reject(new Error('Queue producer deadline exceeded'));
      } else {
        timer = setTimeout(check, Math.ceil(remaining));
      }
    };
    check();
  });
  try {
    // Promise.race observes both late success and late rejection after timeout.
    const result = await Promise.race([operation, timeout]);
    // Synchronous work may exhaust the budget before the timer gets a turn.
    if (performance.now() >= deadline)
      throw new Error('Queue producer deadline exceeded');
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export function assertProducerDeadline(deadline: number): void {
  if (performance.now() >= deadline)
    throw new Error('Queue producer deadline exceeded before dispatch');
}
