import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { NocoBaseQueueManager } from '@nocobase/queue';

export const queueManagerToken: ServiceToken<NocoBaseQueueManager> =
  createServiceToken<NocoBaseQueueManager>('@nocobase/queue/manager');
