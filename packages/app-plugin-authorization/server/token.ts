import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AppAuthorization } from './authorization.js';

export const authorizationToken: ServiceToken<AppAuthorization> =
  createServiceToken<AppAuthorization>('@nocobase/app/authorization');
