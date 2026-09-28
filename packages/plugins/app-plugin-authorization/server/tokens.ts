import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AppAuthorization } from './authorization.js';

/** The application's Authorization; the only service token this plugin registers. */
export const authorizationToken: ServiceToken<AppAuthorization> =
  createServiceToken<AppAuthorization>('@nocobase/app/authorization');
