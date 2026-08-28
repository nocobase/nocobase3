import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { HeartbeatService } from './service.js';

export const heartbeatServiceToken: ServiceToken<HeartbeatService> =
  createServiceToken<HeartbeatService>(
    '@nocobase/app-plugin-service-provider-example/heartbeat',
  );
