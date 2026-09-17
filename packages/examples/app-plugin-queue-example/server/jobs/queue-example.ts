import type { ConsumeHandler } from '@nocobase/queue';

import type { QueueExampleService } from '../service.js';

export interface QueueExamplePayload {
  message: string;
  requestedAt: string;
}

export interface QueueExampleExecution extends QueueExamplePayload {
  executedAt: string;
}

export const queueExampleQueue: string = 'default';
export const queueExampleChannel: string = 'QueueExample';

export function createQueueExampleHandler(
  service: QueueExampleService,
): ConsumeHandler<QueueExamplePayload> {
  return async (channel, message, signal): Promise<void> => {
    if (channel !== queueExampleChannel) return;
    signal.throwIfAborted();
    await service.execute(message, signal);
  };
}
