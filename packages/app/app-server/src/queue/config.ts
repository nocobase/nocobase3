import type { QueueOptions } from '@nocobase/queue';

/** Application-only environment context; never forwarded as a backend option. */
export interface AppQueueServiceConfig extends QueueOptions {
  environment?: string;
}
