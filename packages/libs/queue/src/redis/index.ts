import type { BackendFactory } from 'bullmq';

import type {
  QueueImplementation,
  QueueRuntime,
  QueueRuntimeContext,
} from '../runtime.js';
import { RedisQueueRuntime } from './runtime.js';

/**
 * The BullMQ implementation: every configuration whose backend is not
 * `inMemory` runs on it, with the backend factory registered under its name.
 */
export class RedisQueueImplementation implements QueueImplementation {
  public constructor(
    private readonly backendFactory: (name: string) => BackendFactory,
  ) {}

  public createRuntime(context: QueueRuntimeContext): QueueRuntime {
    return new RedisQueueRuntime(
      context,
      this.backendFactory(context.config.queueBackend),
    );
  }
}
