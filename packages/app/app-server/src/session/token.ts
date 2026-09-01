import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { NocoBaseSessionManager } from '@nocobase/session';

export const sessionManagerToken: ServiceToken<NocoBaseSessionManager> =
  createServiceToken<NocoBaseSessionManager>('@nocobase/session/manager');
