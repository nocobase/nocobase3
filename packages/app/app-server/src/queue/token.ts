import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { NocoBaseQueueManager } from '@nocobase/queue';

export const queueManagerToken: ServiceToken<NocoBaseQueueManager> =
  createServiceToken<NocoBaseQueueManager>('@nocobase/queue/manager');

export const queueServiceToken: ServiceToken<
  import('@nocobase/queue').QueueService
> = createServiceToken<import('@nocobase/queue').QueueService>(
  '@nocobase/queue/service',
);
