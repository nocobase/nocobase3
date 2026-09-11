import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AuthorizationClient } from './authorization-client.js';

export const authorizationClientToken: ServiceToken<AuthorizationClient> =
  createServiceToken<AuthorizationClient>(
    '@nocobase/app-plugin-authorization/client',
  );
