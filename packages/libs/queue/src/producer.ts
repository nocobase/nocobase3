import type { IQueueBackend, Queue } from 'bullmq';
import type { QueueProducer } from './service.js';
import type { ResolvedQueueConfiguration } from './types.js';

export type ProducerQueue = Queue<
  unknown,
  unknown,
  string,
  unknown,
  unknown,
  string,
  IQueueBackend
>;
export interface ProducerContext {
  name: string;
  queue(): Promise<ProducerQueue>;
  configuration(): ResolvedQueueConfiguration;
}

export function createQueueProducer(_context: ProducerContext): QueueProducer {
  throw new Error('Queue producer is not implemented');
}
