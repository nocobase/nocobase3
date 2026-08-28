import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { NocoBaseQueueManager } from './types.js';

export const queueManagerToken: ServiceToken<NocoBaseQueueManager> =
  createServiceToken<NocoBaseQueueManager>('@nocobase/queue/manager');
