import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { QueueService } from '@nocobase/queue';

export const queueServiceToken: ServiceToken<QueueService> =
  createServiceToken<QueueService>('@nocobase/queue/service');
