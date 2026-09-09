import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AuthManager } from './auth-manager.js';

export const authenticationToken: ServiceToken<AuthManager> =
  createServiceToken<AuthManager>('@nocobase/app/authentication');
