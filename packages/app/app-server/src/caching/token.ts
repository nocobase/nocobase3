import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { Caching } from '@nocobase/caching';

export const cachingToken: ServiceToken<Caching> =
  createServiceToken<Caching>('@nocobase/caching');
