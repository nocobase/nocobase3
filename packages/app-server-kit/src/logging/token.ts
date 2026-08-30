import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { Logging } from '@nocobase/logging';

export const loggingToken: ServiceToken<Logging> =
  createServiceToken<Logging>('@nocobase/logging');
