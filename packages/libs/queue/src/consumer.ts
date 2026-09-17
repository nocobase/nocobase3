import type { QueueConsumer } from './service.js';

export interface QueueHandlerRegistry extends QueueConsumer {
  size(): number;
  dispatch(
    channel: string,
    message: unknown,
    signal: AbortSignal,
  ): Promise<void>;
}

export function createQueueHandlerRegistry(): QueueHandlerRegistry {
  throw new Error('Queue handler registry is not implemented');
}
