import { AsyncLocalStorage } from 'node:async_hooks';

export const PRODUCER_REQUEST_TIMEOUT_MS: number = 10000;
export const producerDeadline: AsyncLocalStorage<number> =
  new AsyncLocalStorage<number>();

export function assertProducerDeadline(deadline: number): void {
  if (performance.now() >= deadline)
    throw new Error('Queue producer deadline exceeded before dispatch');
}
