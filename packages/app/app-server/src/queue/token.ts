import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type {
  NocoBaseQueueJobFactoryRegistry,
  NocoBaseQueueManager,
} from '@nocobase/queue';

export const queueManagerToken: ServiceToken<NocoBaseQueueManager> =
  createServiceToken<NocoBaseQueueManager>('@nocobase/queue/manager');

export const queueJobFactoryRegistryToken: ServiceToken<NocoBaseQueueJobFactoryRegistry> =
  createServiceToken<NocoBaseQueueJobFactoryRegistry>(
    '@nocobase/queue/job-factory-registry',
  );
